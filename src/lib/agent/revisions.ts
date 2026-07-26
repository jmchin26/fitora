import { getCatalogue } from "@/lib/catalogue/repository";
import {
  UserPreferencesSchema,
  type Outfit,
  type OutfitReference,
  type Product,
  type ProductCategory,
  type ProductColor,
  type SelectedProduct,
  type Style,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import {
  rehydrateOutfitSelection,
  type RehydrationIssue,
} from "@/lib/catalogue/rehydrate";
import { buildVerifiedOutfit } from "@/lib/styling/build-verified-outfit";
import {
  generateOutfits,
  type GenerationDiagnostics,
} from "@/lib/styling/generate";
import {
  DEMO_MERCHANT_ID,
  type OutfitSelection,
} from "@/lib/styling/validate";

const CATEGORY_ORDER = ["top", "bottom", "shoes"] as const;

export type ReplaceItemRequest = {
  category: ProductCategory;
  strictCheaper?: boolean;
  targetStyle?: Style;
  targetColor?: ProductColor;
};

export type OutfitRevisionDiagnostic =
  | {
      code: "INVALID_CURRENT_OUTFIT";
      message: string;
      issues: RehydrationIssue[];
    }
  | {
      code: "NO_MATCHING_REPLACEMENT" | "NO_CHEAPER_REPLACEMENT";
      message: string;
      category: ProductCategory | null;
      constraints: {
        strictCheaper: boolean;
        targetStyle?: Style;
        targetColor?: ProductColor;
      };
    };

export type OutfitRevisionResult =
  | {
      ok: true;
      status: "success";
      outfit: Outfit;
      changedCategory: ProductCategory;
      previousProductId: string;
      replacementProductId: string;
      savingsCents: number;
    }
  | {
      ok: false;
      status: "no_change";
      diagnostics: OutfitRevisionDiagnostic;
    };

export type PreferenceRevisionDiagnostic = {
  code: "INVALID_PREFERENCES";
  message: string;
};

export type PreferenceRevisionResult =
  | {
      ok: true;
      status: "success";
      preferences: UserPreferences;
      outfits: Outfit[];
    }
  | {
      ok: true;
      status: "no_results";
      preferences: UserPreferences;
      outfits: [];
      diagnostics: {
        code: "NO_OUTFITS";
        message: string;
        generation: GenerationDiagnostics;
      };
    }
  | {
      ok: false;
      status: "no_change";
      diagnostics: PreferenceRevisionDiagnostic;
    };

export type OutfitIdExclusions =
  | readonly string[]
  | ReadonlySet<string>;

type ReplacementCandidate = {
  outfit: Outfit;
  category: ProductCategory;
  previousProductId: string;
  replacementProductId: string;
  savingsCents: number;
};

type CanonicalCurrentOutfit =
  | {
      ok: true;
      selection: OutfitSelection;
      outfit: Outfit;
    }
  | {
      ok: false;
      result: OutfitRevisionResult;
    };

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

function selectedForCategory(
  selection: OutfitSelection,
  category: ProductCategory,
): SelectedProduct {
  return selection[category];
}

function containsExcludedColor(
  product: Product,
  excludedColors: readonly ProductColor[],
): boolean {
  return product.colors.some((color) => excludedColors.includes(color));
}

function canonicalizeCurrentOutfit(
  reference: OutfitReference,
  preferences: UserPreferences,
  catalogue: readonly Product[],
): CanonicalCurrentOutfit {
  const rehydrated = rehydrateOutfitSelection(
    reference,
    preferences,
    catalogue,
  );

  if (!rehydrated.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "no_change",
        diagnostics: {
          code: "INVALID_CURRENT_OUTFIT",
          message: "The current outfit could not be verified.",
          issues: rehydrated.issues,
        },
      },
    };
  }

  const outfit = buildVerifiedOutfit(rehydrated.selection, preferences);

  if (!outfit) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "no_change",
        diagnostics: {
          code: "INVALID_CURRENT_OUTFIT",
          message: "The current outfit failed deterministic verification.",
          issues: [],
        },
      },
    };
  }

  return { ok: true, selection: rehydrated.selection, outfit };
}

function selectionWithReplacement(
  current: OutfitSelection,
  category: ProductCategory,
  product: Product,
  preferences: UserPreferences,
): OutfitSelection {
  const replacement: SelectedProduct = {
    product,
    selectedSize: requestedSize(category, preferences),
  };

  return {
    top: category === "top" ? replacement : current.top,
    bottom: category === "bottom" ? replacement : current.bottom,
    shoes: category === "shoes" ? replacement : current.shoes,
  };
}

function collectReplacementCandidates(
  currentSelection: OutfitSelection,
  currentOutfit: Outfit,
  preferences: UserPreferences,
  request: ReplaceItemRequest,
  catalogue: readonly Product[],
  avoidedOutfitIds: ReadonlySet<string>,
): ReplacementCandidate[] {
  const currentProduct = selectedForCategory(
    currentSelection,
    request.category,
  ).product;
  const size = requestedSize(request.category, preferences);
  const candidates: ReplacementCandidate[] = [];

  for (const product of catalogue) {
    if (
      !product.active ||
      product.merchantId !== DEMO_MERCHANT_ID ||
      product.category !== request.category ||
      product.id === currentProduct.id ||
      !product.sizes.includes(size) ||
      (product.stockBySize[size] ?? 0) <= 0 ||
      containsExcludedColor(product, preferences.excludedColors) ||
      (request.strictCheaper === true &&
        product.priceCents >= currentProduct.priceCents) ||
      (request.targetStyle !== undefined &&
        !product.styleTags.includes(request.targetStyle)) ||
      (request.targetColor !== undefined &&
        !product.colors.includes(request.targetColor))
    ) {
      continue;
    }

    const outfit = buildVerifiedOutfit(
      selectionWithReplacement(
        currentSelection,
        request.category,
        product,
        preferences,
      ),
      preferences,
    );

    if (!outfit) {
      continue;
    }

    if (avoidedOutfitIds.has(outfit.id)) {
      continue;
    }

    candidates.push({
      outfit,
      category: request.category,
      previousProductId: currentProduct.id,
      replacementProductId: product.id,
      savingsCents: currentOutfit.totalCents - outfit.totalCents,
    });
  }

  return candidates;
}

function toSuccessResult(
  candidate: ReplacementCandidate,
): OutfitRevisionResult {
  return {
    ok: true,
    status: "success",
    outfit: candidate.outfit,
    changedCategory: candidate.category,
    previousProductId: candidate.previousProductId,
    replacementProductId: candidate.replacementProductId,
    savingsCents: candidate.savingsCents,
  };
}

function noReplacementResult(
  request: ReplaceItemRequest,
): OutfitRevisionResult {
  const strictCheaper = request.strictCheaper === true;

  return {
    ok: false,
    status: "no_change",
    diagnostics: {
      code: strictCheaper
        ? "NO_CHEAPER_REPLACEMENT"
        : "NO_MATCHING_REPLACEMENT",
      message: strictCheaper
        ? `No cheaper ${request.category} satisfies the active outfit constraints.`
        : `No alternative ${request.category} satisfies the active outfit constraints.`,
      category: request.category,
      constraints: {
        strictCheaper,
        ...(request.targetStyle === undefined
          ? {}
          : { targetStyle: request.targetStyle }),
        ...(request.targetColor === undefined
          ? {}
          : { targetColor: request.targetColor }),
      },
    },
  };
}

function compareGeneralReplacements(
  first: ReplacementCandidate,
  second: ReplacementCandidate,
): number {
  return (
    second.outfit.score - first.outfit.score ||
    first.outfit.totalCents - second.outfit.totalCents ||
    first.replacementProductId.localeCompare(second.replacementProductId) ||
    first.outfit.id.localeCompare(second.outfit.id)
  );
}

function compareCheaperReplacements(
  first: ReplacementCandidate,
  second: ReplacementCandidate,
): number {
  return (
    second.savingsCents - first.savingsCents ||
    second.outfit.score - first.outfit.score ||
    CATEGORY_ORDER.indexOf(first.category) -
      CATEGORY_ORDER.indexOf(second.category) ||
    first.replacementProductId.localeCompare(second.replacementProductId) ||
    first.outfit.id.localeCompare(second.outfit.id)
  );
}

/**
 * Replaces exactly one category and rebuilds every derived outfit fact.
 * The returned shape intentionally contains no selection state; callers clear
 * any prior selection after applying the updated outfit.
 */
export function replaceItem(
  reference: OutfitReference,
  preferences: UserPreferences,
  request: ReplaceItemRequest,
  avoidOutfitIds: OutfitIdExclusions = [],
  catalogue: readonly Product[] = getCatalogue(),
): OutfitRevisionResult {
  const current = canonicalizeCurrentOutfit(
    reference,
    preferences,
    catalogue,
  );

  if (!current.ok) {
    return current.result;
  }

  const candidates = collectReplacementCandidates(
    current.selection,
    current.outfit,
    preferences,
    request,
    catalogue,
    new Set(avoidOutfitIds),
  ).sort(compareGeneralReplacements);
  const candidate = candidates[0];

  return candidate ? toSuccessResult(candidate) : noReplacementResult(request);
}

/**
 * Finds a strictly lower-total one-item revision. With no category supplied,
 * the largest item saving wins, followed by score, category order, and IDs.
 */
export function makeCheaper(
  reference: OutfitReference,
  preferences: UserPreferences,
  category: ProductCategory | null,
  avoidOutfitIds: OutfitIdExclusions = [],
  catalogue: readonly Product[] = getCatalogue(),
): OutfitRevisionResult {
  const current = canonicalizeCurrentOutfit(
    reference,
    preferences,
    catalogue,
  );

  if (!current.ok) {
    return current.result;
  }

  const categories = category === null ? CATEGORY_ORDER : [category];
  const avoidedOutfitIds = new Set(avoidOutfitIds);
  const candidates = categories
    .flatMap((candidateCategory) =>
      collectReplacementCandidates(
        current.selection,
        current.outfit,
        preferences,
        {
          category: candidateCategory,
          strictCheaper: true,
        },
        catalogue,
        avoidedOutfitIds,
      ),
    )
    .filter((candidate) => candidate.savingsCents > 0)
    .sort(compareCheaperReplacements);
  const candidate = candidates[0];

  if (candidate) {
    return toSuccessResult(candidate);
  }

  return {
    ok: false,
    status: "no_change",
    diagnostics: {
      code: "NO_CHEAPER_REPLACEMENT",
      message:
        category === null
          ? "No single-item replacement can reduce this outfit total."
          : `No cheaper ${category} satisfies the active outfit constraints.`,
      category,
      constraints: { strictCheaper: true },
    },
  };
}

function clonePreferences(
  preferences: UserPreferences,
): UserPreferences {
  return {
    ...preferences,
    preferredColors: [...preferences.preferredColors],
    excludedColors: [...preferences.excludedColors],
  };
}

function regeneratePreferences(
  candidate: unknown,
  catalogue: readonly Product[],
): PreferenceRevisionResult {
  const parsed = UserPreferencesSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      ok: false,
      status: "no_change",
      diagnostics: {
        code: "INVALID_PREFERENCES",
        message: "The requested preference change is invalid.",
      },
    };
  }

  const generated = generateOutfits(parsed.data, catalogue);

  if (!generated.ok) {
    return {
      ok: true,
      status: "no_results",
      preferences: parsed.data,
      outfits: [],
      diagnostics: {
        code: "NO_OUTFITS",
        message:
          "The preference change cannot produce a complete verified outfit.",
        generation: generated.diagnostics,
      },
    };
  }

  return {
    ok: true,
    status: "success",
    preferences: parsed.data,
    outfits: generated.outfits,
  };
}

export function changeStyle(
  preferences: UserPreferences,
  style: Style,
  catalogue: readonly Product[] = getCatalogue(),
): PreferenceRevisionResult {
  return regeneratePreferences(
    { ...clonePreferences(preferences), style },
    catalogue,
  );
}

export function changeBudget(
  preferences: UserPreferences,
  budgetCents: number,
  catalogue: readonly Product[] = getCatalogue(),
): PreferenceRevisionResult {
  if (!Number.isInteger(budgetCents) || budgetCents <= 0) {
    return {
      ok: false,
      status: "no_change",
      diagnostics: {
        code: "INVALID_PREFERENCES",
        message: "Budget must be a positive whole number of cents.",
      },
    };
  }

  return regeneratePreferences(
    { ...clonePreferences(preferences), budgetCents },
    catalogue,
  );
}

export function preferColor(
  preferences: UserPreferences,
  color: ProductColor,
  catalogue: readonly Product[] = getCatalogue(),
): PreferenceRevisionResult {
  const cloned = clonePreferences(preferences);

  return regeneratePreferences(
    {
      ...cloned,
      preferredColors: [
        ...new Set([...cloned.preferredColors, color]),
      ],
      excludedColors: cloned.excludedColors.filter(
        (excludedColor) => excludedColor !== color,
      ),
    },
    catalogue,
  );
}

export function excludeColor(
  preferences: UserPreferences,
  color: ProductColor,
  catalogue: readonly Product[] = getCatalogue(),
): PreferenceRevisionResult {
  const cloned = clonePreferences(preferences);

  return regeneratePreferences(
    {
      ...cloned,
      preferredColors: cloned.preferredColors.filter(
        (preferredColor) => preferredColor !== color,
      ),
      excludedColors: [
        ...new Set([...cloned.excludedColors, color]),
      ],
    },
    catalogue,
  );
}
