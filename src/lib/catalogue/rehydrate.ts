import { getCatalogue } from "@/lib/catalogue/repository";
import {
  OutfitReferenceSchema,
  type OutfitReference,
  type Product,
  type ProductCategory,
  type SelectedProduct,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import {
  validateOutfit,
  type OutfitSelection,
  type OutfitValidationIssue,
} from "@/lib/styling/validate";

export type RehydrationIssue =
  | {
      code: "INVALID_SELECTION";
      message: string;
    }
  | {
      code: "UNKNOWN_PRODUCT" | "DUPLICATE_PRODUCT" | "WRONG_CATEGORY";
      message: string;
      category: ProductCategory;
      productId: string;
    }
  | OutfitValidationIssue;

export type RehydrateSelectionResult =
  | {
      ok: true;
      selection: OutfitSelection;
      computedTotalCents: number;
    }
  | {
      ok: false;
      issues: RehydrationIssue[];
      computedTotalCents: number | null;
    };

const CATEGORY_ORDER = ["top", "bottom", "shoes"] as const;

/**
 * Establishes the server-authoritative boundary for a client-supplied outfit.
 * Only IDs and sizes cross the boundary; all product facts are reloaded from
 * the trusted catalogue before validation or total calculation.
 */
export function rehydrateOutfitSelection(
  input: unknown,
  preferences: UserPreferences,
  catalogue: readonly Product[] = getCatalogue(),
): RehydrateSelectionResult {
  const parsed = OutfitReferenceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      computedTotalCents: null,
      issues: [
        {
          code: "INVALID_SELECTION",
          message:
            "The outfit selection must contain only valid product IDs and sizes.",
        },
      ],
    };
  }

  const productsById = new Map(
    catalogue.map((product) => [product.id, product] as const),
  );
  const seenIds = new Set<string>();
  const selected = new Map<ProductCategory, SelectedProduct>();
  const issues: RehydrationIssue[] = [];

  for (const category of CATEGORY_ORDER) {
    const reference: OutfitReference[ProductCategory] = parsed.data[category];
    const product = productsById.get(reference.productId);

    if (!product) {
      issues.push({
        code: "UNKNOWN_PRODUCT",
        message: `The selected ${category} is not in the Fitora catalogue.`,
        category,
        productId: reference.productId,
      });
      continue;
    }

    if (seenIds.has(product.id)) {
      issues.push({
        code: "DUPLICATE_PRODUCT",
        message: "A product cannot fill more than one outfit category.",
        category,
        productId: product.id,
      });
    }
    seenIds.add(product.id);

    if (product.category !== category) {
      issues.push({
        code: "WRONG_CATEGORY",
        message: `${product.name} cannot be used as the outfit's ${category}.`,
        category,
        productId: product.id,
      });
      continue;
    }

    selected.set(category, {
      product,
      selectedSize: reference.selectedSize,
    });
  }

  if (issues.length > 0 || selected.size !== CATEGORY_ORDER.length) {
    return { ok: false, issues, computedTotalCents: null };
  }

  const selection: OutfitSelection = {
    top: selected.get("top")!,
    bottom: selected.get("bottom")!,
    shoes: selected.get("shoes")!,
  };
  const validation = validateOutfit(selection, preferences);

  if (!validation.valid) {
    return {
      ok: false,
      issues: validation.issues,
      computedTotalCents: validation.computedTotalCents,
    };
  }

  return {
    ok: true,
    selection,
    computedTotalCents: validation.computedTotalCents,
  };
}

