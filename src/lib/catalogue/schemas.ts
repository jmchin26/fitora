import { z } from "zod";

export const PRODUCT_CATEGORIES = ["top", "bottom", "shoes"] as const;
export const OCCASIONS = [
  "interview",
  "presentation",
  "casual_event",
] as const;
export const STYLES = ["minimal", "smart_casual", "relaxed"] as const;
export const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const SHOE_SIZES = [
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
] as const;
export const PRODUCT_COLORS = [
  "black",
  "white",
  "navy",
  "charcoal",
  "stone",
  "olive",
  "sage",
  "cream",
  "beige",
  "brown",
  "grey",
  "burgundy",
] as const;

const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);
const OccasionSchema = z.enum(OCCASIONS);
const StyleSchema = z.enum(STYLES);
const ClothingSizeSchema = z.enum(CLOTHING_SIZES);
const ShoeSizeSchema = z.enum(SHOE_SIZES);
const ProductSizeSchema = z.union([ClothingSizeSchema, ShoeSizeSchema]);
const ProductColorSchema = z.enum(PRODUCT_COLORS);

function addDuplicateIssue(
  values: readonly string[],
  path: string,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: `${path} must not contain duplicate values.`,
        path: [path, index],
      });
    }

    seen.add(value);
  });
}

const ProductObjectSchema = z
  .object({
    id: z.string().trim().regex(/^(top|bottom|shoes)-\d{2}$/),
    merchantId: z.literal("fitora-demo"),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    altText: z.string().trim().min(1),
    category: ProductCategorySchema,
    priceCents: z.number().int().positive(),
    currency: z.literal("USD"),
    imagePath: z
      .string()
      .trim()
      .regex(/^\/products\/(top|bottom|shoes)-\d{2}\.(svg|webp|avif)$/),
    colors: z.array(ProductColorSchema).min(1),
    sizes: z.array(ProductSizeSchema).min(1),
    stockBySize: z.record(z.string().min(1), z.number().int().nonnegative()),
    occasionTags: z.array(OccasionSchema).min(1),
    styleTags: z.array(StyleSchema).min(1),
    active: z.boolean(),
  })
  .strict();

export const ProductSchema = ProductObjectSchema.superRefine(
  (product, context) => {
    if (!product.id.startsWith(`${product.category}-`)) {
      context.addIssue({
        code: "custom",
        message: `Product ID must start with "${product.category}-".`,
        path: ["id"],
      });
    }

    const allowedSizes: readonly string[] =
      product.category === "shoes" ? SHOE_SIZES : CLOTHING_SIZES;
    const allowedSizeSet = new Set(allowedSizes);

    product.sizes.forEach((size, index) => {
      if (!allowedSizeSet.has(size)) {
        context.addIssue({
          code: "custom",
          message: `${product.category} products cannot use size "${size}".`,
          path: ["sizes", index],
        });
      }
    });

    addDuplicateIssue(product.colors, "colors", context);
    addDuplicateIssue(product.sizes, "sizes", context);
    addDuplicateIssue(product.occasionTags, "occasionTags", context);
    addDuplicateIssue(product.styleTags, "styleTags", context);

    const sizeSet = new Set<string>(product.sizes);
    const stockSizeSet = new Set(Object.keys(product.stockBySize));
    const sizesMatchStock =
      sizeSet.size === stockSizeSet.size &&
      [...sizeSet].every((size) => stockSizeSet.has(size));

    if (!sizesMatchStock) {
      context.addIssue({
        code: "custom",
        message: "stockBySize keys must exactly match sizes.",
        path: ["stockBySize"],
      });
    }
  },
);

export const CatalogueSchema = z
  .array(ProductSchema)
  .length(30, "Catalogue must contain exactly 30 products.")
  .superRefine((products, context) => {
    const firstIndexById = new Map<string, number>();
    const firstIndexByImagePath = new Map<string, number>();
    const categoryCounts: Record<ProductCategory, number> = {
      top: 0,
      bottom: 0,
      shoes: 0,
    };

    products.forEach((product, index) => {
      categoryCounts[product.category] += 1;

      if (firstIndexById.has(product.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate product ID "${product.id}".`,
          path: [index, "id"],
        });
      } else {
        firstIndexById.set(product.id, index);
      }

      if (firstIndexByImagePath.has(product.imagePath)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate image path "${product.imagePath}".`,
          path: [index, "imagePath"],
        });
      } else {
        firstIndexByImagePath.set(product.imagePath, index);
      }
    });

    PRODUCT_CATEGORIES.forEach((category) => {
      if (categoryCounts[category] !== 10) {
        context.addIssue({
          code: "custom",
          message: `Catalogue must contain exactly 10 ${category} products.`,
          path: [],
        });
      }
    });
  });

export const UserPreferencesSchema = z
  .object({
    occasion: OccasionSchema,
    budgetCents: z.number().int().positive(),
    topSize: ClothingSizeSchema,
    bottomSize: ClothingSizeSchema,
    shoeSize: ShoeSizeSchema,
    preferredColors: z.array(ProductColorSchema),
    excludedColors: z.array(ProductColorSchema),
    style: StyleSchema,
  })
  .strict()
  .superRefine((preferences, context) => {
    addDuplicateIssue(
      preferences.preferredColors,
      "preferredColors",
      context,
    );
    addDuplicateIssue(
      preferences.excludedColors,
      "excludedColors",
      context,
    );

    const preferredColors = new Set<string>(preferences.preferredColors);

    preferences.excludedColors.forEach((color, index) => {
      if (preferredColors.has(color)) {
        context.addIssue({
          code: "custom",
          message: `Color "${color}" cannot be both preferred and excluded.`,
          path: ["excludedColors", index],
        });
      }
    });
  });

export const ProductReferenceSchema = z
  .object({
    productId: z.string().trim().regex(/^(top|bottom|shoes)-\d{2}$/),
    selectedSize: ProductSizeSchema,
  })
  .strict();

export const OutfitReferenceSchema = z
  .object({
    top: ProductReferenceSchema,
    bottom: ProductReferenceSchema,
    shoes: ProductReferenceSchema,
  })
  .strict();

export const SelectedProductSchema = z
  .object({
    product: ProductSchema,
    selectedSize: ProductSizeSchema,
  })
  .strict()
  .superRefine((selection, context) => {
    if (!selection.product.sizes.includes(selection.selectedSize)) {
      context.addIssue({
        code: "custom",
        message: "Selected size is not offered by this product.",
        path: ["selectedSize"],
      });
      return;
    }

    if (selection.product.stockBySize[selection.selectedSize] <= 0) {
      context.addIssue({
        code: "custom",
        message: "Selected size is out of stock.",
        path: ["selectedSize"],
      });
    }
  });

export const ScoreBreakdownSchema = z
  .object({
    occasion: z.number().int().min(0).max(30),
    style: z.number().int().min(0).max(25),
    colorCompatibility: z.number().int().min(0).max(20),
    preferredColors: z.number().int().min(0).max(15),
    budgetEfficiency: z.number().int().min(0).max(10),
  })
  .strict();

export const OutfitSchema = z
  .object({
    id: z.string().trim().min(1),
    top: SelectedProductSchema,
    bottom: SelectedProductSchema,
    shoes: SelectedProductSchema,
    totalCents: z.number().int().positive(),
    score: z.number().int().min(0).max(100),
    scoreBreakdown: ScoreBreakdownSchema,
    reasonCodes: z.array(z.string().trim().min(1)),
    explanation: z.string().trim().min(1),
  })
  .strict()
  .superRefine((outfit, context) => {
    const slots = [
      ["top", outfit.top.product.category, "top"],
      ["bottom", outfit.bottom.product.category, "bottom"],
      ["shoes", outfit.shoes.product.category, "shoes"],
    ] as const;

    slots.forEach(([slot, actualCategory, expectedCategory]) => {
      if (actualCategory !== expectedCategory) {
        context.addIssue({
          code: "custom",
          message: `${slot} must contain a ${expectedCategory} product.`,
          path: [slot, "product", "category"],
        });
      }
    });

    const computedTotal =
      outfit.top.product.priceCents +
      outfit.bottom.product.priceCents +
      outfit.shoes.product.priceCents;

    if (outfit.totalCents !== computedTotal) {
      context.addIssue({
        code: "custom",
        message: "totalCents must equal the sum of selected product prices.",
        path: ["totalCents"],
      });
    }

    const computedScore = Object.values(outfit.scoreBreakdown).reduce(
      (total, component) => total + component,
      0,
    );

    if (outfit.score !== computedScore) {
      context.addIssue({
        code: "custom",
        message: "score must equal the sum of scoreBreakdown components.",
        path: ["score"],
      });
    }
  });

export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export type Occasion = z.infer<typeof OccasionSchema>;
export type Style = z.infer<typeof StyleSchema>;
export type ClothingSize = z.infer<typeof ClothingSizeSchema>;
export type ShoeSize = z.infer<typeof ShoeSizeSchema>;
export type ProductSize = z.infer<typeof ProductSizeSchema>;
export type ProductColor = z.infer<typeof ProductColorSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Catalogue = z.infer<typeof CatalogueSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type ProductReference = z.infer<typeof ProductReferenceSchema>;
export type OutfitReference = z.infer<typeof OutfitReferenceSchema>;
export type SelectedProduct = z.infer<typeof SelectedProductSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type Outfit = z.infer<typeof OutfitSchema>;
