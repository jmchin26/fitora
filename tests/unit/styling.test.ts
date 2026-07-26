import { describe, expect, it } from "vitest";

import { getCatalogue } from "@/lib/catalogue/repository";
import {
  OutfitSchema,
  type Product,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import {
  COLOUR_COMPATIBILITY_MATRIX,
  getColourPairCompatibility,
  scoreColourCompatibility,
} from "@/lib/styling/colour-compatibility";
import {
  generateOutfits,
  REUSED_PRODUCT_PENALTY,
} from "@/lib/styling/generate";
import { scoreOutfit } from "@/lib/styling/rank";
import { validateOutfit } from "@/lib/styling/validate";

const standardPreferences: UserPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

function mutableCatalogue(): Product[] {
  return structuredClone(getCatalogue()) as Product[];
}

function generatedStandardOutfits() {
  const result = generateOutfits(standardPreferences);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("The standard fixture must generate outfits.");
  }

  return result.outfits;
}

describe("colour compatibility", () => {
  it("uses a complete, symmetric matrix with explicit weak pairings", () => {
    expect(COLOUR_COMPATIBILITY_MATRIX.navy.white).toBe(2);
    expect(COLOUR_COMPATIBILITY_MATRIX.olive.burgundy).toBe(0);
    expect(getColourPairCompatibility("burgundy", "olive")).toBe(0);
    expect(getColourPairCompatibility("navy", "white")).toBe(
      getColourPairCompatibility("white", "navy"),
    );
  });

  it("produces meaningful variation across the real catalogue", () => {
    const catalogue = getCatalogue();
    const tops = catalogue.filter((product) => product.category === "top");
    const bottoms = catalogue.filter(
      (product) => product.category === "bottom",
    );
    const shoes = catalogue.filter(
      (product) => product.category === "shoes",
    );
    const scores = new Set<number>();

    for (const top of tops) {
      for (const bottom of bottoms) {
        for (const shoe of shoes) {
          scores.add(scoreColourCompatibility([top, bottom, shoe]));
        }
      }
    }

    expect(scores.size).toBeGreaterThan(1);
    expect([...scores].some((score) => score < 20)).toBe(true);
  });
});

describe("deterministic outfit generation", () => {
  it("returns three valid outfits for the standard demo fixture", () => {
    const outfits = generatedStandardOutfits();

    expect(outfits).toHaveLength(3);

    for (const outfit of outfits) {
      expect(OutfitSchema.safeParse(outfit).success).toBe(true);
      expect(outfit.totalCents).toBeLessThanOrEqual(
        standardPreferences.budgetCents,
      );
      expect(outfit.top.selectedSize).toBe("M");
      expect(outfit.bottom.selectedSize).toBe("M");
      expect(outfit.shoes.selectedSize).toBe("42");
      expect(validateOutfit(outfit, standardPreferences).valid).toBe(true);
    }
  });

  it("keeps every score in range and equal to its five components", () => {
    for (const outfit of generatedStandardOutfits()) {
      const rescored = scoreOutfit(outfit, standardPreferences);
      const componentTotal = Object.values(outfit.scoreBreakdown).reduce(
        (total, component) => total + component,
        0,
      );

      expect(outfit.score).toBeGreaterThanOrEqual(0);
      expect(outfit.score).toBeLessThanOrEqual(100);
      expect(outfit.score).toBe(componentTotal);
      expect(rescored).toEqual({
        score: outfit.score,
        scoreBreakdown: outfit.scoreBreakdown,
        reasonCodes: outfit.reasonCodes,
      });
    }
  });

  it("removes every product containing an excluded colour", () => {
    const result = generateOutfits({
      ...standardPreferences,
      preferredColors: ["navy", "white"],
      excludedColors: ["black"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Non-black alternatives should remain available.");
    }

    for (const outfit of result.outfits) {
      for (const selected of [outfit.top, outfit.bottom, outfit.shoes]) {
        expect(selected.product.colors).not.toContain("black");
      }
    }
  });

  it("returns low-budget diagnostics and never an over-budget outfit", () => {
    const result = generateOutfits({
      ...standardPreferences,
      budgetCents: 10_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("The fixture budget is below the catalogue minimum.");
    }

    expect(result.outfits).toEqual([]);
    expect(result.diagnostics.code).toBe("NO_OUTFIT_WITHIN_BUDGET");
    expect(result.diagnostics.minimumAchievableTotalCents).toBe(11_100);
    expect(result.diagnostics.constrainedCategories.length).toBeGreaterThan(0);
    expect(result.diagnostics.suggestions).toHaveLength(1);
    expect(result.diagnostics.suggestions[0]).toMatch(
      /^Raise your budget to at least \$/,
    );
  });

  it("reports a category when the requested size is not offered", () => {
    const catalogue = mutableCatalogue();

    for (const product of catalogue.filter(
      (candidate) => candidate.category === "top",
    )) {
      product.sizes = product.sizes.filter((size) => size !== "M");
      delete product.stockBySize.M;
    }

    const result = generateOutfits(standardPreferences, catalogue);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("No top offers the requested size.");
    }

    expect(result.diagnostics).toMatchObject({
      code: "NO_ELIGIBLE_PRODUCTS",
      minimumAchievableTotalCents: null,
      constrainedCategories: ["top"],
    });
    expect(result.diagnostics.suggestions[0]).toContain("size M");
  });

  it("reports a category when every requested-size unit is out of stock", () => {
    const catalogue = mutableCatalogue();

    for (const product of catalogue.filter(
      (candidate) => candidate.category === "shoes",
    )) {
      product.stockBySize["42"] = 0;
    }

    const result = generateOutfits(standardPreferences, catalogue);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Every shoe is out of stock in the requested size.");
    }

    expect(result.diagnostics.code).toBe("NO_ELIGIBLE_PRODUCTS");
    expect(result.diagnostics.constrainedCategories).toEqual(["shoes"]);
    expect(result.diagnostics.suggestions[0]).toContain("out of stock");
  });

  it("is deterministic even when catalogue input order changes", () => {
    const forward = generateOutfits(standardPreferences, getCatalogue());
    const reversed = generateOutfits(
      standardPreferences,
      [...getCatalogue()].reverse(),
    );

    expect(forward).toEqual(reversed);
  });

  it("breaks explicit score ties by stable product IDs", () => {
    const tieCatalogue = mutableCatalogue()
      .filter((product) =>
        [
          "top-01",
          "top-02",
          "bottom-01",
          "bottom-02",
          "shoes-01",
          "shoes-02",
        ].includes(product.id),
      )
      .map((product) => ({
        ...product,
        priceCents: 3_000,
        colors: ["navy"] as Product["colors"],
        occasionTags: ["presentation"] as Product["occasionTags"],
        styleTags: ["smart_casual"] as Product["styleTags"],
      }));

    const forward = generateOutfits(standardPreferences, tieCatalogue);
    const reversed = generateOutfits(
      standardPreferences,
      [...tieCatalogue].reverse(),
    );

    expect(forward).toEqual(reversed);
    expect(forward.ok).toBe(true);
  });

  it("uses a truthful neutral reason when no colour is preferred", () => {
    const result = generateOutfits({
      ...standardPreferences,
      preferredColors: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The neutral-colour fixture should generate outfits.");
    }

    for (const outfit of result.outfits) {
      expect(outfit.scoreBreakdown.preferredColors).toBe(15);
      expect(outfit.reasonCodes).toContain(
        "preferred-colour:not-specified-neutral-score",
      );
      expect(outfit.reasonCodes.join(" ")).not.toContain(
        "preferred-colour-match:3-of-3",
      );
    }
  });

  it("returns unique combinations when candidate scarcity requires reuse", () => {
    const catalogue = mutableCatalogue().filter((product) =>
      ["top-01", "bottom-01", "shoes-01", "shoes-02", "shoes-03"].includes(
        product.id,
      ),
    );
    const result = generateOutfits(standardPreferences, catalogue);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Three shoe alternatives should create three outfits.");
    }

    expect(result.outfits).toHaveLength(3);
    expect(new Set(result.outfits.map((outfit) => outfit.id)).size).toBe(3);
    expect(
      new Set(result.outfits.map((outfit) => outfit.shoes.product.id)).size,
    ).toBe(3);
  });

  it("never repeats a combination and strongly prefers product diversity", () => {
    const outfits = generatedStandardOutfits();
    const combinationIds = outfits.map((outfit) => outfit.id);
    const allProductIds = outfits.flatMap((outfit) => [
      outfit.top.product.id,
      outfit.bottom.product.id,
      outfit.shoes.product.id,
    ]);

    expect(REUSED_PRODUCT_PENALTY).toBe(18);
    expect(new Set(combinationIds).size).toBe(outfits.length);
    expect(new Set(allProductIds).size).toBe(allProductIds.length);
  });

  it("rejects a recomputed total that exceeds a reduced budget", () => {
    const outfit = generatedStandardOutfits()[0];
    expect(outfit).toBeDefined();

    if (!outfit) {
      throw new Error("Expected the standard fixture to produce an outfit.");
    }

    const validation = validateOutfit(outfit, {
      ...standardPreferences,
      budgetCents: outfit.totalCents - 1,
    });

    expect(validation.valid).toBe(false);
    if (validation.valid) {
      throw new Error("The outfit must be rejected above the reduced budget.");
    }
    expect(validation.issues.map((issue) => issue.code)).toContain(
      "OVER_BUDGET",
    );
  });
});
