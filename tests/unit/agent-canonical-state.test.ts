import { describe, expect, it } from "vitest";

import { canonicalizeAgentState } from "@/lib/agent/canonical-state";
import type {
  Outfit,
  OutfitReference,
  UserPreferences,
} from "@/lib/catalogue/schemas";
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

function toReference(outfit: Outfit): OutfitReference {
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

function generatedReferences(): OutfitReference[] {
  const generated = generateOutfits(preferences);

  if (!generated.ok) {
    throw new Error("The standard fixture must generate outfits.");
  }

  return generated.outfits.map(toReference);
}

describe("canonical agent state", () => {
  it("rehydrates every reference and recomputes totals, scores, and explanations", () => {
    const references = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: references,
      selectedOutfit: references[1],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The generated references must canonicalize.");
    }

    expect(result.state.outfits).toHaveLength(3);
    expect(result.state.selectedOutfit).toBe(result.state.outfits[1]);

    for (const outfit of result.state.outfits) {
      expect(outfit.totalCents).toBe(
        outfit.top.product.priceCents +
          outfit.bottom.product.priceCents +
          outfit.shoes.product.priceCents,
      );
      expect(outfit.score).toBe(
        Object.values(outfit.scoreBreakdown).reduce(
          (total, component) => total + component,
          0,
        ),
      );
      expect(outfit.explanation).toContain("The catalogue total is $");
      expect(outfit.reasonCodes).toHaveLength(5);
    }
  });

  it("rejects forged product facts instead of accepting a richer client object", () => {
    const [reference] = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: [
        {
          ...reference,
          top: {
            ...reference.top,
            priceCents: 1,
            merchantId: "forged-merchant",
          },
        },
      ],
      selectedOutfit: null,
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "INVALID_STATE",
          message:
            "Agent state must contain only valid preferences and outfit references.",
        },
      ],
    });
  });

  it("rejects a structurally valid but unknown catalogue reference", () => {
    const [reference] = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: [
        {
          ...reference,
          top: { productId: "top-99", selectedSize: "M" },
        },
      ],
      selectedOutfit: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("An unknown product must not canonicalize.");
    }

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OUTFIT_REHYDRATION_FAILED",
          issues: expect.arrayContaining([
            expect.objectContaining({ code: "UNKNOWN_PRODUCT" }),
          ]),
        }),
      ]),
    );
  });

  it("rejects duplicate visible outfit references", () => {
    const [reference] = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: [reference, structuredClone(reference)],
      selectedOutfit: reference,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Duplicate visible combinations must be rejected.");
    }

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_OUTFIT_REFERENCE",
          outfitIndex: 1,
        }),
      ]),
    );
  });

  it("rejects a selected reference that is not in the visible outfit list", () => {
    const references = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: [references[0]],
      selectedOutfit: references[1],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("A stale selection must not canonicalize.");
    }

    expect(result.diagnostics).toContainEqual({
      code: "SELECTION_NOT_IN_OUTFITS",
      message: "The selected outfit must be one of the supplied outfits.",
    });
  });

  it("enforces the three-outfit state boundary", () => {
    const references = generatedReferences();
    const result = canonicalizeAgentState({
      preferences,
      outfits: [
        references[0],
        references[1],
        references[2],
        references[0],
      ],
      selectedOutfit: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Agent state cannot contain more than three outfits.");
    }
    expect(result.diagnostics[0]?.code).toBe("INVALID_STATE");
  });
});
