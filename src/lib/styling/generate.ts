import { getCatalogue } from "@/lib/catalogue/repository";
import type {
  Outfit,
  Product,
  ProductCategory,
  SelectedProduct,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { formatUsd, sumCents } from "@/lib/money";
import { buildVerifiedOutfit } from "@/lib/styling/build-verified-outfit";
import {
  DEMO_MERCHANT_ID,
  type OutfitSelection,
} from "@/lib/styling/validate";

export const REUSED_PRODUCT_PENALTY = 18;

export type GenerationDiagnosticCode =
  | "NO_ELIGIBLE_PRODUCTS"
  | "NO_OUTFIT_WITHIN_BUDGET";

export type GenerationDiagnostics = {
  code: GenerationDiagnosticCode;
  minimumAchievableTotalCents: number | null;
  constrainedCategories: ProductCategory[];
  suggestions: string[];
};

export type GenerateOutfitsResult =
  | {
      ok: true;
      outfits: Outfit[];
    }
  | {
      ok: false;
      outfits: [];
      diagnostics: GenerationDiagnostics;
    };

const CATEGORY_ORDER = ["top", "bottom", "shoes"] as const;

function requestedSize(
  category: ProductCategory,
  preferences: UserPreferences,
): SelectedProduct["selectedSize"] {
  if (category === "top") {
    return preferences.topSize;
  }

  if (category === "bottom") {
    return preferences.bottomSize;
  }

  return preferences.shoeSize;
}

function containsExcludedColour(
  product: Product,
  excludedColours: readonly string[],
): boolean {
  const excluded = new Set(
    excludedColours.map((colour) => colour.trim().toLowerCase()),
  );

  return product.colors.some((colour) =>
    excluded.has(colour.trim().toLowerCase()),
  );
}

function isEligibleProduct(
  product: Product,
  category: ProductCategory,
  preferences: UserPreferences,
): boolean {
  const size = requestedSize(category, preferences);

  return (
    product.active &&
    product.merchantId === DEMO_MERCHANT_ID &&
    product.category === category &&
    product.sizes.includes(size) &&
    (product.stockBySize[size] ?? 0) > 0 &&
    !containsExcludedColour(product, preferences.excludedColors)
  );
}

function eligibleProductsByCategory(
  catalogue: readonly Product[],
  preferences: UserPreferences,
): Record<ProductCategory, Product[]> {
  return {
    top: catalogue
      .filter((product) => isEligibleProduct(product, "top", preferences))
      .sort((first, second) => first.id.localeCompare(second.id)),
    bottom: catalogue
      .filter((product) => isEligibleProduct(product, "bottom", preferences))
      .sort((first, second) => first.id.localeCompare(second.id)),
    shoes: catalogue
      .filter((product) => isEligibleProduct(product, "shoes", preferences))
      .sort((first, second) => first.id.localeCompare(second.id)),
  };
}

function selectProduct(product: Product, selectedSize: string): SelectedProduct {
  return { product, selectedSize } as SelectedProduct;
}

function buildSelection(
  top: Product,
  bottom: Product,
  shoes: Product,
  preferences: UserPreferences,
): OutfitSelection {
  return {
    top: selectProduct(top, preferences.topSize),
    bottom: selectProduct(bottom, preferences.bottomSize),
    shoes: selectProduct(shoes, preferences.shoeSize),
  };
}

function productIds(outfit: Outfit): readonly string[] {
  return [
    outfit.top.product.id,
    outfit.bottom.product.id,
    outfit.shoes.product.id,
  ];
}

function reuseCount(candidate: Outfit, selected: readonly Outfit[]): number {
  const candidateIds = new Set(productIds(candidate));

  return selected.reduce(
    (count, outfit) =>
      count +
      productIds(outfit).filter((productId) => candidateIds.has(productId))
        .length,
    0,
  );
}

function compareCandidates(
  first: Outfit,
  second: Outfit,
  selected: readonly Outfit[],
): number {
  const firstAdjustedScore =
    first.score - reuseCount(first, selected) * REUSED_PRODUCT_PENALTY;
  const secondAdjustedScore =
    second.score - reuseCount(second, selected) * REUSED_PRODUCT_PENALTY;

  return (
    secondAdjustedScore - firstAdjustedScore ||
    second.score - first.score ||
    first.totalCents - second.totalCents ||
    first.id.localeCompare(second.id)
  );
}

function selectDiverseOutfits(candidates: readonly Outfit[]): Outfit[] {
  const remaining = [...candidates];
  const selected: Outfit[] = [];

  while (selected.length < 3 && remaining.length > 0) {
    remaining.sort((first, second) =>
      compareCandidates(first, second, selected),
    );
    const next = remaining.shift();

    if (next) {
      selected.push(next);
    }
  }

  return selected;
}

function missingCategorySuggestion(
  category: ProductCategory,
  catalogue: readonly Product[],
  preferences: UserPreferences,
): string {
  const size = requestedSize(category, preferences);
  const activeMerchantProducts = catalogue.filter(
    (product) =>
      product.category === category &&
      product.active &&
      product.merchantId === DEMO_MERCHANT_ID,
  );
  const sizeMatches = activeMerchantProducts.filter((product) =>
    product.sizes.includes(size),
  );
  const inStock = sizeMatches.filter(
    (product) => (product.stockBySize[size] ?? 0) > 0,
  );

  if (activeMerchantProducts.length === 0) {
    return `No active ${category} is available from the demo merchant.`;
  }

  if (sizeMatches.length === 0) {
    return `Try a different ${category} size; no ${category} is offered in size ${size}.`;
  }

  if (inStock.length === 0) {
    return `Try a different ${category} size; size ${size} is currently out of stock.`;
  }

  return `Remove an excluded colour to restore available ${category} options.`;
}

function budgetCostDrivers(
  minimumByCategory: Record<ProductCategory, number>,
  budgetCents: number,
): ProductCategory[] {
  const equalCategoryShare = budgetCents / CATEGORY_ORDER.length;
  const aboveShare = CATEGORY_ORDER.filter(
    (category) => minimumByCategory[category] > equalCategoryShare,
  );

  if (aboveShare.length > 0) {
    return aboveShare;
  }

  const highestMinimum = Math.max(...Object.values(minimumByCategory));
  return CATEGORY_ORDER.filter(
    (category) => minimumByCategory[category] === highestMinimum,
  );
}

function excludedColourSavingsSuggestion(
  eligible: Record<ProductCategory, Product[]>,
  catalogue: readonly Product[],
  preferences: UserPreferences,
): string | null {
  for (const category of CATEGORY_ORDER) {
    const size = requestedSize(category, preferences);
    const currentMinimum = Math.min(
      ...eligible[category].map((product) => product.priceCents),
    );
    const blockedCheaperProduct = catalogue
      .filter(
        (product) =>
          product.active &&
          product.merchantId === DEMO_MERCHANT_ID &&
          product.category === category &&
          product.sizes.includes(size) &&
          (product.stockBySize[size] ?? 0) > 0 &&
          containsExcludedColour(product, preferences.excludedColors) &&
          product.priceCents < currentMinimum,
      )
      .sort(
        (first, second) =>
          first.priceCents - second.priceCents ||
          first.id.localeCompare(second.id),
      )[0];

    if (blockedCheaperProduct) {
      const blockedColours = blockedCheaperProduct.colors.filter((colour) =>
        preferences.excludedColors.includes(colour),
      );

      return `If flexible, allow ${blockedColours.join(" or ")} to consider ${blockedCheaperProduct.name} at ${formatUsd(blockedCheaperProduct.priceCents)}.`;
    }
  }

  return null;
}

function noEligibleProductsDiagnostics(
  eligible: Record<ProductCategory, Product[]>,
  catalogue: readonly Product[],
  preferences: UserPreferences,
): GenerateOutfitsResult {
  const constrainedCategories = CATEGORY_ORDER.filter(
    (category) => eligible[category].length === 0,
  );

  return {
    ok: false,
    outfits: [],
    diagnostics: {
      code: "NO_ELIGIBLE_PRODUCTS",
      minimumAchievableTotalCents: null,
      constrainedCategories,
      suggestions: constrainedCategories
        .map((category) =>
          missingCategorySuggestion(category, catalogue, preferences),
        )
        .slice(0, 2),
    },
  };
}

function noBudgetDiagnostics(
  eligible: Record<ProductCategory, Product[]>,
  catalogue: readonly Product[],
  preferences: UserPreferences,
): GenerateOutfitsResult {
  const minimumByCategory: Record<ProductCategory, number> = {
    top: Math.min(...eligible.top.map((product) => product.priceCents)),
    bottom: Math.min(...eligible.bottom.map((product) => product.priceCents)),
    shoes: Math.min(...eligible.shoes.map((product) => product.priceCents)),
  };
  const minimumAchievableTotalCents = sumCents(
    Object.values(minimumByCategory),
  );
  const constrainedCategories = budgetCostDrivers(
    minimumByCategory,
    preferences.budgetCents,
  );
  const optionalSavingsSuggestion = excludedColourSavingsSuggestion(
    eligible,
    catalogue,
    preferences,
  );
  const suggestions = [
    `Raise your budget to at least ${formatUsd(minimumAchievableTotalCents)} for the least expensive complete outfit.`,
  ];

  if (optionalSavingsSuggestion) {
    suggestions.push(optionalSavingsSuggestion);
  }

  return {
    ok: false,
    outfits: [],
    diagnostics: {
      code: "NO_OUTFIT_WITHIN_BUDGET",
      minimumAchievableTotalCents,
      constrainedCategories,
      suggestions,
    },
  };
}

export function generateOutfits(
  preferences: UserPreferences,
  catalogue: readonly Product[] = getCatalogue(),
): GenerateOutfitsResult {
  const eligible = eligibleProductsByCategory(catalogue, preferences);

  if (CATEGORY_ORDER.some((category) => eligible[category].length === 0)) {
    return noEligibleProductsDiagnostics(eligible, catalogue, preferences);
  }

  const candidates: Outfit[] = [];

  for (const top of eligible.top) {
    for (const bottom of eligible.bottom) {
      for (const shoes of eligible.shoes) {
        const candidate = buildVerifiedOutfit(
          buildSelection(top, bottom, shoes, preferences),
          preferences,
        );

        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }

  if (candidates.length === 0) {
    return noBudgetDiagnostics(eligible, catalogue, preferences);
  }

  return {
    ok: true,
    outfits: selectDiverseOutfits(candidates),
  };
}
