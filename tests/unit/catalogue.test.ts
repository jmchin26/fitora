import { describe, expect, it } from "vitest";

import {
  getCatalogue,
  getProductById,
  getProductsByCategory,
  validateCatalogueData,
} from "@/lib/catalogue/repository";
import {
  CatalogueSchema,
  PRODUCT_CATEGORIES,
  UserPreferencesSchema,
  type Product,
} from "@/lib/catalogue/schemas";

function mutableCatalogueCopy(): Product[] {
  return structuredClone(getCatalogue()) as Product[];
}

describe("catalogue validation", () => {
  it("accepts the bundled catalogue", () => {
    expect(() => validateCatalogueData(getCatalogue())).not.toThrow();
    expect(CatalogueSchema.safeParse(getCatalogue()).success).toBe(true);
  });

  it("contains exactly 30 products split 10/10/10 by category", () => {
    const catalogue = getCatalogue();

    expect(catalogue).toHaveLength(30);

    for (const category of PRODUCT_CATEGORIES) {
      expect(getProductsByCategory(category)).toHaveLength(10);
    }
  });

  it("has unique product IDs and image paths", () => {
    const catalogue = getCatalogue();
    const ids = catalogue.map((product) => product.id);
    const imagePaths = catalogue.map((product) => product.imagePath);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(imagePaths).size).toBe(imagePaths.length);
  });

  it("deep-freezes the server-authoritative catalogue", () => {
    const catalogue = getCatalogue();
    const product = catalogue[0];

    expect(Object.isFrozen(catalogue)).toBe(true);
    expect(Object.isFrozen(product)).toBe(true);
    expect(Object.isFrozen(product?.stockBySize)).toBe(true);
  });

  it("retrieves a catalogue product by its authoritative ID", () => {
    const product = getCatalogue()[0];

    expect(product).toBeDefined();
    expect(getProductById(product?.id ?? "")).toEqual(product);
    expect(getProductById("missing-product-id")).toBeUndefined();
  });

  it("rejects stock keys that do not exactly match the offered sizes", () => {
    const candidate = mutableCatalogueCopy();
    candidate[0].stockBySize.UNLISTED = 1;

    expect(CatalogueSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects duplicate product IDs", () => {
    const candidate = mutableCatalogueCopy();
    candidate[1].id = candidate[0].id;

    expect(CatalogueSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects an outfit score that does not equal its breakdown", async () => {
    const { generateOutfits } = await import("@/lib/styling/generate");
    const result = generateOutfits({
      occasion: "presentation",
      budgetCents: 15_000,
      topSize: "M",
      bottomSize: "M",
      shoeSize: "42",
      preferredColors: ["navy"],
      excludedColors: [],
      style: "smart_casual",
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.outfits[0]) {
      throw new Error("Expected a fixture outfit.");
    }

    const forged = {
      ...result.outfits[0],
      score: result.outfits[0].score === 100 ? 99 : 100,
    };
    expect(
      (await import("@/lib/catalogue/schemas")).OutfitSchema.safeParse(forged)
        .success,
    ).toBe(false);
  });
});

describe("user preference validation", () => {
  const validPreferences = {
    occasion: "presentation",
    budgetCents: 15_000,
    topSize: "M",
    bottomSize: "M",
    shoeSize: "42",
    preferredColors: ["navy", "white"],
    excludedColors: ["burgundy"],
    style: "smart_casual",
  } as const;

  it("accepts valid preferences", () => {
    expect(UserPreferencesSchema.safeParse(validPreferences).success).toBe(true);
  });

  it("rejects duplicate colors within either preference list", () => {
    const duplicatePreferred = {
      ...validPreferences,
      preferredColors: ["navy", "navy"],
    };
    const duplicateExcluded = {
      ...validPreferences,
      excludedColors: ["black", "black"],
    };

    expect(UserPreferencesSchema.safeParse(duplicatePreferred).success).toBe(
      false,
    );
    expect(UserPreferencesSchema.safeParse(duplicateExcluded).success).toBe(
      false,
    );
  });

  it("rejects a color that is both preferred and excluded", () => {
    const conflictingPreferences = {
      ...validPreferences,
      excludedColors: ["navy"],
    };

    expect(UserPreferencesSchema.safeParse(conflictingPreferences).success).toBe(
      false,
    );
  });

  it("requires a positive integer budget", () => {
    expect(
      UserPreferencesSchema.safeParse({
        ...validPreferences,
        budgetCents: 0,
      }).success,
    ).toBe(false);
    expect(
      UserPreferencesSchema.safeParse({
        ...validPreferences,
        budgetCents: 10_000.5,
      }).success,
    ).toBe(false);
  });
});
