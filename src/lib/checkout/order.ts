import { z } from "zod";

import { getCatalogue } from "@/lib/catalogue/repository";
import {
  CLOTHING_SIZES,
  OutfitReferenceSchema,
  PRODUCT_CATEGORIES,
  ProductReferenceSchema,
  SHOE_SIZES,
  type OutfitReference,
  type Product,
  type ProductCategory,
} from "@/lib/catalogue/schemas";

export const CHECKOUT_MERCHANT_ID = "fitora-demo" as const;
export const CHECKOUT_CURRENCY = "USD" as const;

const ORDER_CATEGORIES = PRODUCT_CATEGORIES;
const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);

/**
 * This is the complete browser-authorized order input. Names, prices,
 * merchant facts, quantities, and totals are deliberately not accepted.
 */
export const CheckoutOrderInputSchema = z
  .object({
    outfit: OutfitReferenceSchema,
  })
  .strict();

export const VerifiedOrderItemSchema = z
  .object({
    category: ProductCategorySchema,
    productId: ProductReferenceSchema.shape.productId,
    name: z.string().trim().min(1),
    imagePath: z.string().trim().min(1),
    selectedSize: ProductReferenceSchema.shape.selectedSize,
    unitPriceCents: z.number().int().positive(),
    quantity: z.literal(1),
    lineTotalCents: z.number().int().positive(),
  })
  .strict()
  .superRefine((item, context) => {
    if (!item.productId.startsWith(`${item.category}-`)) {
      context.addIssue({
        code: "custom",
        message: "The product ID does not match the item category.",
        path: ["productId"],
      });
    }

    if (item.lineTotalCents !== item.unitPriceCents) {
      context.addIssue({
        code: "custom",
        message: "The line total must equal the unit price for quantity one.",
        path: ["lineTotalCents"],
      });
    }

    const allowedSizes: readonly string[] =
      item.category === "shoes" ? SHOE_SIZES : CLOTHING_SIZES;

    if (!allowedSizes.includes(item.selectedSize)) {
      context.addIssue({
        code: "custom",
        message: "The selected size does not match the item category.",
        path: ["selectedSize"],
      });
    }
  });

export const VerifiedOrderSchema = z
  .object({
    reference: OutfitReferenceSchema,
    merchantId: z.literal(CHECKOUT_MERCHANT_ID),
    currency: z.literal(CHECKOUT_CURRENCY),
    items: z.tuple([
      VerifiedOrderItemSchema,
      VerifiedOrderItemSchema,
      VerifiedOrderItemSchema,
    ]),
    subtotalCents: z.number().int().positive(),
    totalCents: z.number().int().positive(),
  })
  .strict()
  .superRefine((order, context) => {
    let computedTotalCents = 0;

    ORDER_CATEGORIES.forEach((category, index) => {
      const item = order.items[index];
      const reference = order.reference[category];

      if (item.category !== category) {
        context.addIssue({
          code: "custom",
          message: `Item ${index + 1} must be the ${category}.`,
          path: ["items", index, "category"],
        });
      }

      if (
        item.productId !== reference.productId ||
        item.selectedSize !== reference.selectedSize
      ) {
        context.addIssue({
          code: "custom",
          message: `The ${category} item must match the canonical reference.`,
          path: ["items", index],
        });
      }

      computedTotalCents += item.lineTotalCents;
    });

    if (order.subtotalCents !== computedTotalCents) {
      context.addIssue({
        code: "custom",
        message: "The subtotal must equal the sum of the canonical items.",
        path: ["subtotalCents"],
      });
    }

    if (order.totalCents !== order.subtotalCents) {
      context.addIssue({
        code: "custom",
        message: "The total must equal the subtotal.",
        path: ["totalCents"],
      });
    }
  });

export type CheckoutOrderInput = z.infer<typeof CheckoutOrderInputSchema>;
export type VerifiedOrderItem = z.infer<typeof VerifiedOrderItemSchema>;
export type VerifiedOrder = z.infer<typeof VerifiedOrderSchema>;

export const CHECKOUT_ORDER_ISSUE_CODES = [
  "INVALID_ORDER_INPUT",
  "UNKNOWN_PRODUCT",
  "DUPLICATE_PRODUCT",
  "WRONG_CATEGORY",
  "INACTIVE_PRODUCT",
  "WRONG_MERCHANT",
  "MIXED_MERCHANTS",
  "SIZE_NOT_OFFERED",
  "OUT_OF_STOCK",
  "INVALID_PRICE",
  "WRONG_CURRENCY",
  "TOTAL_OVERFLOW",
  "INVALID_CATALOGUE_PRODUCT",
] as const;

export type CheckoutOrderIssueCode =
  (typeof CHECKOUT_ORDER_ISSUE_CODES)[number];

export type CheckoutOrderIssue = {
  code: CheckoutOrderIssueCode;
  message: string;
  category?: ProductCategory;
  productId?: string;
};

export type CheckoutOrderVerificationResult =
  | {
      ok: true;
      order: VerifiedOrder;
    }
  | {
      ok: false;
      issues: CheckoutOrderIssue[];
    };

function issue(
  code: CheckoutOrderIssueCode,
  message: string,
  category?: ProductCategory,
  productId?: string,
): CheckoutOrderIssue {
  return {
    code,
    message,
    ...(category === undefined ? {} : { category }),
    ...(productId === undefined ? {} : { productId }),
  };
}

/**
 * Rebuilds an order exclusively from the trusted catalogue. The only client
 * facts that survive are product IDs and selected sizes.
 */
export function verifyCheckoutOrder(
  input: unknown,
  catalogue: readonly Product[] = getCatalogue(),
): CheckoutOrderVerificationResult {
  const parsed = CheckoutOrderInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_ORDER_INPUT",
          "The checkout request must contain only an outfit reference.",
        ),
      ],
    };
  }

  const productsById = new Map(
    catalogue.map((product) => [product.id, product] as const),
  );
  const seenProductIds = new Set<string>();
  const merchantIds = new Set<string>();
  const issues: CheckoutOrderIssue[] = [];
  const selectedProducts: Partial<Record<ProductCategory, Product>> = {};

  for (const category of ORDER_CATEGORIES) {
    const reference: OutfitReference[ProductCategory] =
      parsed.data.outfit[category];
    const product = productsById.get(reference.productId);

    if (!product) {
      issues.push(
        issue(
          "UNKNOWN_PRODUCT",
          `The selected ${category} is not in the Fitora catalogue.`,
          category,
          reference.productId,
        ),
      );
      continue;
    }

    selectedProducts[category] = product;
    merchantIds.add(product.merchantId);

    if (seenProductIds.has(product.id)) {
      issues.push(
        issue(
          "DUPLICATE_PRODUCT",
          "A product cannot fill more than one order category.",
          category,
          product.id,
        ),
      );
    }
    seenProductIds.add(product.id);

    if (product.category !== category) {
      issues.push(
        issue(
          "WRONG_CATEGORY",
          `The selected product cannot fill the order's ${category} slot.`,
          category,
          product.id,
        ),
      );
    }

    if (!product.active) {
      issues.push(
        issue(
          "INACTIVE_PRODUCT",
          `The selected ${category} is no longer active.`,
          category,
          product.id,
        ),
      );
    }

    if (product.merchantId !== CHECKOUT_MERCHANT_ID) {
      issues.push(
        issue(
          "WRONG_MERCHANT",
          `The selected ${category} is not sold by the Fitora demo merchant.`,
          category,
          product.id,
        ),
      );
    }

    if (product.currency !== CHECKOUT_CURRENCY) {
      issues.push(
        issue(
          "WRONG_CURRENCY",
          `The selected ${category} is not priced in USD.`,
          category,
          product.id,
        ),
      );
    }

    if (
      !Number.isSafeInteger(product.priceCents) ||
      product.priceCents <= 0
    ) {
      issues.push(
        issue(
          "INVALID_PRICE",
          `The selected ${category} does not have a valid catalogue price.`,
          category,
          product.id,
        ),
      );
    }

    if (!product.sizes.includes(reference.selectedSize)) {
      issues.push(
        issue(
          "SIZE_NOT_OFFERED",
          `The selected ${category} is not offered in that size.`,
          category,
          product.id,
        ),
      );
    } else if ((product.stockBySize[reference.selectedSize] ?? 0) <= 0) {
      issues.push(
        issue(
          "OUT_OF_STOCK",
          `The selected ${category} is out of stock in that size.`,
          category,
          product.id,
        ),
      );
    }
  }

  if (merchantIds.size > 1) {
    issues.push(
      issue(
        "MIXED_MERCHANTS",
        "All order items must belong to one merchant.",
      ),
    );
  }

  if (
    issues.length > 0 ||
    !selectedProducts.top ||
    !selectedProducts.bottom ||
    !selectedProducts.shoes
  ) {
    return { ok: false, issues };
  }

  const canonicalProducts = [
    selectedProducts.top,
    selectedProducts.bottom,
    selectedProducts.shoes,
  ] as const;
  const items = canonicalProducts.map((product, index) => {
    const category = ORDER_CATEGORIES[index];
    const selectedSize = parsed.data.outfit[category].selectedSize;

    return {
      category,
      productId: product.id,
      name: product.name,
      imagePath: product.imagePath,
      selectedSize,
      unitPriceCents: product.priceCents,
      quantity: 1 as const,
      lineTotalCents: product.priceCents,
    };
  }) as [
    VerifiedOrderItem,
    VerifiedOrderItem,
    VerifiedOrderItem,
  ];

  const totalCents = items.reduce(
    (total, item) => total + item.lineTotalCents,
    0,
  );

  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return {
      ok: false,
      issues: [
        issue(
          "TOTAL_OVERFLOW",
          "The catalogue prices cannot produce a safe order total.",
        ),
      ],
    };
  }

  const reference: OutfitReference = {
    top: {
      productId: items[0].productId,
      selectedSize: items[0].selectedSize,
    },
    bottom: {
      productId: items[1].productId,
      selectedSize: items[1].selectedSize,
    },
    shoes: {
      productId: items[2].productId,
      selectedSize: items[2].selectedSize,
    },
  };
  const orderCandidate = {
    reference,
    merchantId: CHECKOUT_MERCHANT_ID,
    currency: CHECKOUT_CURRENCY,
    items,
    subtotalCents: totalCents,
    totalCents,
  };
  const order = VerifiedOrderSchema.safeParse(orderCandidate);

  if (!order.success) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_CATALOGUE_PRODUCT",
          "The catalogue could not produce a canonical checkout order.",
        ),
      ],
    };
  }

  return { ok: true, order: order.data };
}
