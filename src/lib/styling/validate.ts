import type {
  Outfit,
  ProductCategory,
  SelectedProduct,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { sumCents } from "@/lib/money";

export const DEMO_MERCHANT_ID = "fitora-demo";

export type OutfitSelection = Pick<Outfit, "top" | "bottom" | "shoes"> &
  Partial<Pick<Outfit, "totalCents">>;

export type OutfitValidationIssueCode =
  | "INACTIVE_PRODUCT"
  | "WRONG_MERCHANT"
  | "WRONG_CATEGORY"
  | "DUPLICATE_PRODUCT"
  | "WRONG_SELECTED_SIZE"
  | "SIZE_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "EXCLUDED_COLOUR"
  | "TOTAL_MISMATCH"
  | "OVER_BUDGET";

export type OutfitValidationIssue = {
  code: OutfitValidationIssueCode;
  message: string;
  category?: ProductCategory;
  productId?: string;
};

export type OutfitValidationResult =
  | {
      valid: true;
      computedTotalCents: number;
      issues: [];
    }
  | {
      valid: false;
      computedTotalCents: number;
      issues: OutfitValidationIssue[];
    };

const CATEGORIES = ["top", "bottom", "shoes"] as const;

function requestedSize(
  category: ProductCategory,
  preferences: UserPreferences,
): string {
  if (category === "top") {
    return preferences.topSize;
  }

  if (category === "bottom") {
    return preferences.bottomSize;
  }

  return preferences.shoeSize;
}

function hasExcludedColour(
  selectedProduct: SelectedProduct,
  excludedColours: readonly string[],
): boolean {
  const excluded = new Set(
    excludedColours.map((colour) => colour.trim().toLowerCase()),
  );

  return selectedProduct.product.colors.some((colour) =>
    excluded.has(colour.trim().toLowerCase()),
  );
}

export function validateOutfit(
  selection: OutfitSelection,
  preferences: UserPreferences,
): OutfitValidationResult {
  const issues: OutfitValidationIssue[] = [];
  const selectedByCategory: Record<ProductCategory, SelectedProduct> = {
    top: selection.top,
    bottom: selection.bottom,
    shoes: selection.shoes,
  };
  const seenProductIds = new Set<string>();

  for (const category of CATEGORIES) {
    const selected = selectedByCategory[category];
    const { product, selectedSize } = selected;
    const productContext = { category, productId: product.id };

    if (!product.active) {
      issues.push({
        code: "INACTIVE_PRODUCT",
        message: `${product.name} is inactive.`,
        ...productContext,
      });
    }

    if (product.merchantId !== DEMO_MERCHANT_ID) {
      issues.push({
        code: "WRONG_MERCHANT",
        message: `${product.name} is not sold by the Fitora demo merchant.`,
        ...productContext,
      });
    }

    if (product.category !== category) {
      issues.push({
        code: "WRONG_CATEGORY",
        message: `${product.name} cannot be used as the outfit's ${category}.`,
        ...productContext,
      });
    }

    if (seenProductIds.has(product.id)) {
      issues.push({
        code: "DUPLICATE_PRODUCT",
        message: `${product.name} is used more than once.`,
        ...productContext,
      });
    }
    seenProductIds.add(product.id);

    const expectedSize = requestedSize(category, preferences);
    if (selectedSize !== expectedSize) {
      issues.push({
        code: "WRONG_SELECTED_SIZE",
        message: `${product.name} must use requested size ${expectedSize}.`,
        ...productContext,
      });
    }

    if (!product.sizes.includes(selectedSize)) {
      issues.push({
        code: "SIZE_UNAVAILABLE",
        message: `${product.name} is not available in size ${selectedSize}.`,
        ...productContext,
      });
    } else if ((product.stockBySize[selectedSize] ?? 0) <= 0) {
      issues.push({
        code: "OUT_OF_STOCK",
        message: `${product.name} is out of stock in size ${selectedSize}.`,
        ...productContext,
      });
    }

    if (hasExcludedColour(selected, preferences.excludedColors)) {
      issues.push({
        code: "EXCLUDED_COLOUR",
        message: `${product.name} includes an excluded colour.`,
        ...productContext,
      });
    }
  }

  const computedTotalCents = sumCents(
    CATEGORIES.map(
      (category) => selectedByCategory[category].product.priceCents,
    ),
  );

  if (
    selection.totalCents !== undefined &&
    selection.totalCents !== computedTotalCents
  ) {
    issues.push({
      code: "TOTAL_MISMATCH",
      message: "The supplied outfit total does not match catalogue prices.",
    });
  }

  if (computedTotalCents > preferences.budgetCents) {
    issues.push({
      code: "OVER_BUDGET",
      message: "The outfit exceeds the requested budget.",
    });
  }

  if (issues.length === 0) {
    return { valid: true, computedTotalCents, issues: [] };
  }

  return { valid: false, computedTotalCents, issues };
}
