import { describe, expect, it } from "vitest";

import {
  changeBudget,
  changeStyle,
  excludeColor,
  makeCheaper,
  preferColor,
  replaceItem,
} from "@/lib/agent/revisions";
import { getCatalogue } from "@/lib/catalogue/repository";
import type {
  Outfit,
  OutfitReference,
  Product,
  ProductCategory,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { buildVerifiedOutfit } from "@/lib/styling/build-verified-outfit";
import { generateOutfits } from "@/lib/styling/generate";

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

const expensivePreferences: UserPreferences = {
  ...standardPreferences,
  budgetCents: 20_000,
};

const expensiveReference: OutfitReference = {
  top: { productId: "top-08", selectedSize: "M" },
  bottom: { productId: "bottom-10", selectedSize: "M" },
  shoes: { productId: "shoes-08", selectedSize: "42" },
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

function standardOutfit(): Outfit {
  const generated = generateOutfits(standardPreferences);

  if (!generated.ok || !generated.outfits[0]) {
    throw new Error("The standard fixture must generate an outfit.");
  }

  return generated.outfits[0];
}

function productId(
  reference: OutfitReference,
  category: ProductCategory,
): string {
  return reference[category].productId;
}

describe("single-item outfit revisions", () => {
  it.each(["top", "bottom", "shoes"] as const)(
    "replaces exactly one %s and recomputes every derived fact",
    (category) => {
      const current = standardOutfit();
      const currentReference = toReference(current);
      const result = replaceItem(
        currentReference,
        standardPreferences,
        { category },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Expected a ${category} alternative.`);
      }

      expect(result.changedCategory).toBe(category);
      expect(result.replacementProductId).not.toBe(
        productId(currentReference, category),
      );

      for (const otherCategory of [
        "top",
        "bottom",
        "shoes",
      ] as const) {
        if (otherCategory !== category) {
          expect(result.outfit[otherCategory].product.id).toBe(
            productId(currentReference, otherCategory),
          );
        }
      }

      expect(result.outfit.totalCents).toBe(
        result.outfit.top.product.priceCents +
          result.outfit.bottom.product.priceCents +
          result.outfit.shoes.product.priceCents,
      );
      expect(result.outfit.score).toBe(
        Object.values(result.outfit.scoreBreakdown).reduce(
          (total, component) => total + component,
          0,
        ),
      );
      expect(
        buildVerifiedOutfit(result.outfit, standardPreferences),
      ).toEqual(result.outfit);
    },
  );

  it("applies target style and colour as hard replacement constraints", () => {
    const reference: OutfitReference = {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-03", selectedSize: "42" },
    };
    const result = replaceItem(reference, standardPreferences, {
      category: "top",
      targetStyle: "relaxed",
      targetColor: "burgundy",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The catalogue contains a relaxed burgundy top.");
    }
    expect(result.replacementProductId).toBe("top-10");
    expect(result.outfit.top.product.styleTags).toContain("relaxed");
    expect(result.outfit.top.product.colors).toContain("burgundy");
  });

  it("chooses the greatest single-item saving across all categories", () => {
    const result = makeCheaper(
      expensiveReference,
      expensivePreferences,
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The expensive fixture has cheaper alternatives.");
    }

    expect(result.changedCategory).toBe("top");
    expect(result.previousProductId).toBe("top-08");
    expect(result.replacementProductId).toBe("top-09");
    expect(result.savingsCents).toBe(2_000);
    expect(result.outfit.totalCents).toBe(14_200);
  });

  it("strictly reduces the total for a category-specific cheaper request", () => {
    const result = makeCheaper(
      expensiveReference,
      expensivePreferences,
      "shoes",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("The expensive shoes have cheaper alternatives.");
    }
    expect(result.changedCategory).toBe("shoes");
    expect(result.savingsCents).toBeGreaterThan(0);
    expect(result.outfit.totalCents).toBeLessThan(16_200);
  });

  it("avoids visible outfit IDs when selecting replacement candidates", () => {
    const reference = toReference(standardOutfit());
    const firstReplacement = replaceItem(
      reference,
      standardPreferences,
      { category: "top" },
    );

    expect(firstReplacement.ok).toBe(true);
    if (!firstReplacement.ok) {
      throw new Error("The catalogue must contain a top replacement.");
    }

    const nextReplacement = replaceItem(
      reference,
      standardPreferences,
      { category: "top" },
      [firstReplacement.outfit.id],
    );

    expect(nextReplacement.ok).toBe(true);
    if (!nextReplacement.ok) {
      throw new Error("The catalogue must contain a second top replacement.");
    }
    expect(nextReplacement.outfit.id).not.toBe(firstReplacement.outfit.id);

    const firstCheaper = makeCheaper(
      expensiveReference,
      expensivePreferences,
      null,
    );
    expect(firstCheaper.ok).toBe(true);
    if (!firstCheaper.ok) {
      throw new Error("The expensive fixture must have a cheaper revision.");
    }

    const nextCheaper = makeCheaper(
      expensiveReference,
      expensivePreferences,
      null,
      new Set([firstCheaper.outfit.id]),
    );
    expect(nextCheaper.ok).toBe(true);
    if (!nextCheaper.ok) {
      throw new Error("The fixture must have another cheaper revision.");
    }
    expect(nextCheaper.outfit.id).not.toBe(firstCheaper.outfit.id);
  });

  it("returns typed no-change diagnostics when no alternative exists", () => {
    const current = standardOutfit();
    const reference = toReference(current);
    const selectedIds = new Set([
      reference.top.productId,
      reference.bottom.productId,
      reference.shoes.productId,
    ]);
    const scarceCatalogue = getCatalogue().filter((product) =>
      selectedIds.has(product.id),
    );
    const result = replaceItem(
      reference,
      standardPreferences,
      { category: "top" },
      [],
      scarceCatalogue,
    );

    expect(result).toMatchObject({
      ok: false,
      status: "no_change",
      diagnostics: {
        code: "NO_MATCHING_REPLACEMENT",
        category: "top",
      },
    });
  });

  it("enforces exclusions and never falls back to a conflicting target colour", () => {
    const reference: OutfitReference = {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-03", selectedSize: "42" },
    };
    const result = replaceItem(
      reference,
      {
        ...standardPreferences,
        excludedColors: ["burgundy"],
      },
      {
        category: "top",
        targetColor: "burgundy",
      },
    );

    expect(result).toMatchObject({
      ok: false,
      status: "no_change",
      diagnostics: { code: "NO_MATCHING_REPLACEMENT" },
    });
  });

  it("rejects an invalid current reference before considering replacements", () => {
    const current = toReference(standardOutfit());
    const result = replaceItem(
      {
        ...current,
        shoes: { productId: "shoes-99", selectedSize: "42" },
      },
      standardPreferences,
      { category: "shoes" },
    );

    expect(result).toMatchObject({
      ok: false,
      status: "no_change",
      diagnostics: {
        code: "INVALID_CURRENT_OUTFIT",
        issues: [expect.objectContaining({ code: "UNKNOWN_PRODUCT" })],
      },
    });
  });
});

describe("preference revisions", () => {
  it("gives the newest colour command precedence without mutating input", () => {
    const initial: UserPreferences = {
      ...standardPreferences,
      preferredColors: ["navy"],
      excludedColors: ["sage"],
    };
    const original = structuredClone(initial);
    const preferred = preferColor(initial, "sage");

    expect(preferred.ok).toBe(true);
    expect(preferred.status).toBe("success");
    if (!preferred.ok || preferred.status !== "success") {
      throw new Error("Preferring sage should retain valid results.");
    }
    expect(preferred.preferences.preferredColors).toEqual(["navy", "sage"]);
    expect(preferred.preferences.excludedColors).toEqual([]);
    expect(initial).toEqual(original);

    const excluded = excludeColor(preferred.preferences, "navy");

    expect(excluded.ok).toBe(true);
    expect(excluded.status).toBe("success");
    if (!excluded.ok || excluded.status !== "success") {
      throw new Error("Excluding navy should retain valid results.");
    }
    expect(excluded.preferences.preferredColors).toEqual(["sage"]);
    expect(excluded.preferences.excludedColors).toEqual(["navy"]);
  });

  it("regenerates outfits after style and valid budget changes", () => {
    const styleResult = changeStyle(standardPreferences, "relaxed");

    expect(styleResult.ok).toBe(true);
    expect(styleResult.status).toBe("success");
    if (!styleResult.ok || styleResult.status !== "success") {
      throw new Error("Relaxed outfits should be available.");
    }
    expect(styleResult.preferences.style).toBe("relaxed");
    expect(styleResult.outfits.length).toBeGreaterThan(0);

    const budgetResult = changeBudget(standardPreferences, 14_000);

    expect(budgetResult.ok).toBe(true);
    expect(budgetResult.status).toBe("success");
    if (!budgetResult.ok || budgetResult.status !== "success") {
      throw new Error("The adjusted budget should retain outfits.");
    }
    expect(
      budgetResult.outfits.every(
        (outfit) => outfit.totalCents <= 14_000,
      ),
    ).toBe(true);
  });

  it("preserves a valid low-budget preference with no-results diagnostics", () => {
    const result = changeBudget(standardPreferences, 10_000);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("no_results");
    if (!result.ok || result.status !== "no_results") {
      throw new Error("A positive low budget is valid but has no outfits.");
    }
    expect(result.preferences.budgetCents).toBe(10_000);
    expect(result.outfits).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      code: "NO_OUTFITS",
      generation: { code: "NO_OUTFIT_WITHIN_BUDGET" },
    });
  });

  it("never accepts a zero, negative, or fractional budget", () => {
    for (const budgetCents of [0, -1, 10.5]) {
      const result = changeBudget(standardPreferences, budgetCents);

      expect(result).toMatchObject({
        ok: false,
        status: "no_change",
        diagnostics: { code: "INVALID_PREFERENCES" },
      });
    }
  });

  it("does not mutate a caller-provided catalogue during revision", () => {
    const catalogue = structuredClone(getCatalogue()) as Product[];
    const before = structuredClone(catalogue);
    const result = changeStyle(
      standardPreferences,
      "minimal",
      catalogue,
    );

    expect(result.ok).toBe(true);
    expect(catalogue).toEqual(before);
  });
});
