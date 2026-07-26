import { describe, expect, it } from "vitest";

import { getCatalogue, getProductById } from "@/lib/catalogue/repository";
import type {
  OutfitReference,
  Product,
} from "@/lib/catalogue/schemas";
import {
  CheckoutOrderInputSchema,
  VerifiedOrderSchema,
  verifyCheckoutOrder,
} from "@/lib/checkout/order";

const VALID_REFERENCE: OutfitReference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};

function withProduct(
  productId: string,
  change: (product: Product) => Product,
): Product[] {
  return getCatalogue().map((product) =>
    product.id === productId ? change(product) : product,
  );
}

function issueCodes(result: ReturnType<typeof verifyCheckoutOrder>) {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("checkout order verification", () => {
  it("accepts only the strict browser outfit-reference boundary", () => {
    expect(
      CheckoutOrderInputSchema.safeParse({
        outfit: VALID_REFERENCE,
      }).success,
    ).toBe(true);

    expect(
      verifyCheckoutOrder({
        outfit: {
          ...VALID_REFERENCE,
          top: {
            ...VALID_REFERENCE.top,
            name: "Forged name",
            priceCents: 1,
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "INVALID_ORDER_INPUT" }],
    });

    expect(
      verifyCheckoutOrder({
        outfit: VALID_REFERENCE,
        totalCents: 1,
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "INVALID_ORDER_INPUT" }],
    });
  });

  it("rehydrates canonical product facts and recomputes integer totals", () => {
    const result = verifyCheckoutOrder({ outfit: VALID_REFERENCE });
    const products = [
      getProductById("top-01"),
      getProductById("bottom-01"),
      getProductById("shoes-01"),
    ];
    const expectedTotal = products.reduce(
      (total, product) => total + (product?.priceCents ?? 0),
      0,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.order).toMatchObject({
      reference: VALID_REFERENCE,
      merchantId: "fitora-demo",
      currency: "USD",
      subtotalCents: expectedTotal,
      totalCents: expectedTotal,
    });
    expect(result.order.items.map((item) => item.category)).toEqual([
      "top",
      "bottom",
      "shoes",
    ]);
    expect(result.order.items[0]).toMatchObject({
      productId: "top-01",
      name: getProductById("top-01")?.name,
      unitPriceCents: getProductById("top-01")?.priceCents,
      quantity: 1,
      lineTotalCents: getProductById("top-01")?.priceCents,
    });
    expect(VerifiedOrderSchema.safeParse(result.order).success).toBe(
      true,
    );
  });

  it("returns a typed unknown-product failure", () => {
    const result = verifyCheckoutOrder({
      outfit: {
        ...VALID_REFERENCE,
        top: { productId: "top-99", selectedSize: "M" },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: "UNKNOWN_PRODUCT",
          category: "top",
          productId: "top-99",
        },
      ],
    });
  });

  it("rejects category swaps even when both IDs exist", () => {
    const result = verifyCheckoutOrder({
      outfit: {
        top: { productId: "bottom-01", selectedSize: "M" },
        bottom: { productId: "top-01", selectedSize: "M" },
        shoes: VALID_REFERENCE.shoes,
      },
    });

    expect(issueCodes(result)).toEqual([
      "WRONG_CATEGORY",
      "WRONG_CATEGORY",
    ]);
  });

  it("distinguishes a size the product does not offer from no stock", () => {
    const invalidSize = verifyCheckoutOrder({
      outfit: {
        ...VALID_REFERENCE,
        top: { productId: "top-01", selectedSize: "42" },
      },
    });
    const outOfStock = verifyCheckoutOrder({
      outfit: {
        ...VALID_REFERENCE,
        top: { productId: "top-04", selectedSize: "XS" },
      },
    });

    expect(issueCodes(invalidSize)).toContain("SIZE_NOT_OFFERED");
    expect(issueCodes(outOfStock)).toContain("OUT_OF_STOCK");
  });

  it("rejects inactive catalogue products", () => {
    const catalogue = withProduct("top-01", (product) => ({
      ...product,
      active: false,
    }));
    const result = verifyCheckoutOrder(
      { outfit: VALID_REFERENCE },
      catalogue,
    );

    expect(issueCodes(result)).toContain("INACTIVE_PRODUCT");
  });

  it("rejects wrong and mixed merchants", () => {
    const catalogue = withProduct(
      "top-01",
      (product) =>
        ({
          ...product,
          merchantId: "untrusted-merchant",
        }) as unknown as Product,
    );
    const result = verifyCheckoutOrder(
      { outfit: VALID_REFERENCE },
      catalogue,
    );

    expect(issueCodes(result)).toContain("WRONG_MERCHANT");
    expect(issueCodes(result)).toContain("MIXED_MERCHANTS");
  });

  it("rejects non-integer catalogue prices instead of rounding them", () => {
    const catalogue = withProduct(
      "top-01",
      (product) =>
        ({
          ...product,
          priceCents: 3_600.5,
        }) as Product,
    );
    const result = verifyCheckoutOrder(
      { outfit: VALID_REFERENCE },
      catalogue,
    );

    expect(issueCodes(result)).toContain("INVALID_PRICE");
  });

  it("keeps VerifiedOrder totals and references internally consistent", () => {
    const verified = verifyCheckoutOrder({ outfit: VALID_REFERENCE });
    expect(verified.ok).toBe(true);

    if (!verified.ok) return;

    expect(
      VerifiedOrderSchema.safeParse({
        ...verified.order,
        totalCents: verified.order.totalCents + 1,
      }).success,
    ).toBe(false);
    expect(
      VerifiedOrderSchema.safeParse({
        ...verified.order,
        reference: {
          ...verified.order.reference,
          top: { productId: "top-02", selectedSize: "M" },
        },
      }).success,
    ).toBe(false);
  });
});
