import { describe, expect, it } from "vitest";

import { rehydrateOutfitSelection } from "@/lib/catalogue/rehydrate";
import type { UserPreferences } from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

const preferences: UserPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

function validReference() {
  const generated = generateOutfits(preferences);

  if (!generated.ok || !generated.outfits[0]) {
    throw new Error("Expected a generated fixture outfit.");
  }

  const outfit = generated.outfits[0];

  return {
    top: {
      productId: outfit.top.product.id,
      selectedSize: outfit.top.selectedSize,
    },
    bottom: {
      productId: outfit.bottom.product.id,
      selectedSize: outfit.bottom.selectedSize,
    },
    shoes: {
      productId: outfit.shoes.product.id,
      selectedSize: outfit.shoes.selectedSize,
    },
  };
}

describe("authoritative outfit rehydration", () => {
  it("rebuilds product facts and totals from catalogue IDs", () => {
    const result = rehydrateOutfitSelection(validReference(), preferences);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The generated reference must rehydrate.");
    }

    expect(result.computedTotalCents).toBe(
      result.selection.top.product.priceCents +
        result.selection.bottom.product.priceCents +
        result.selection.shoes.product.priceCents,
    );
  });

  it("rejects injected client product facts instead of trusting them", () => {
    const reference = validReference();
    const result = rehydrateOutfitSelection(
      {
        ...reference,
        top: {
          ...reference.top,
          priceCents: 1,
          stockBySize: { M: 999 },
        },
      },
      preferences,
    );

    expect(result).toMatchObject({
      ok: false,
      computedTotalCents: null,
      issues: [{ code: "INVALID_SELECTION" }],
    });
  });

  it("rejects an unknown catalogue ID", () => {
    const reference = validReference();
    const result = rehydrateOutfitSelection(
      { ...reference, top: { productId: "top-99", selectedSize: "M" } },
      preferences,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("An unknown ID cannot rehydrate.");
    }
    expect(result.issues.map((issue) => issue.code)).toContain(
      "UNKNOWN_PRODUCT",
    );
  });

  it("rejects a product placed in the wrong category", () => {
    const reference = validReference();
    const result = rehydrateOutfitSelection(
      {
        ...reference,
        top: {
          productId: reference.bottom.productId,
          selectedSize: "M",
        },
      },
      preferences,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("A bottom cannot be rehydrated as a top.");
    }
    expect(result.issues.map((issue) => issue.code)).toContain(
      "WRONG_CATEGORY",
    );
  });
});

