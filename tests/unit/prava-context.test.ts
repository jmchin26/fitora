import { describe, expect, it } from "vitest";

import { resolvePravaAwaitingContext } from "@/lib/checkout/prava-context";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  formatPravaAmount,
  type PravaMerchant,
  type PravaPaymentResult,
} from "@/lib/payments/prava";

const MERCHANT = {
  name: "Fitora Demo Merchant",
  url: "https://merchant.fitora.example",
  countryCode: "US",
} as const satisfies PravaMerchant;

function orderFixture(): VerifiedOrder {
  const result = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!result.ok) {
    throw new Error("Expected a canonical Prava context fixture.");
  }

  return result.order;
}

function awaitingResult(order = orderFixture()): PravaPaymentResult {
  return {
    status: "awaiting_result",
    sessionId: "session_test_001",
    orderId: "order_test_001",
    transactions: [
      {
        transactionId: "transaction_test_001",
        lineItems: [
          {
            transactionReferenceId: "line_test_001",
            merchantName: MERCHANT.name,
            merchantUrl: MERCHANT.url,
            totalAmount: formatPravaAmount(order.totalCents),
            credential: {
              token: "TEST_ONLY_ONE_TIME_VALUE",
              dynamicCvv: "999",
              expiryMonth: "12",
              expiryYear: "2099",
            },
            products: order.items.map((item, index) => ({
              productReferenceId: `provider_product_${index + 1}`,
              externalProductId: item.productId,
              name: item.name,
              unitPrice: formatPravaAmount(item.unitPriceCents),
              quantity: item.quantity,
            })),
          },
        ],
      },
    ],
  };
}

describe("Prava awaiting-result context", () => {
  it("accepts exactly one canonical merchant line item", () => {
    const order = orderFixture();
    const result = awaitingResult(order);
    const resolved = resolvePravaAwaitingContext(
      result,
      order,
      MERCHANT,
    );

    expect(resolved).toMatchObject({
      ok: true,
      lineItem: { transactionReferenceId: "line_test_001" },
    });
  });

  it("treats equivalent HTTPS origin serialization as the same merchant", () => {
    const order = orderFixture();
    const result = awaitingResult(order);

    if (result.status !== "awaiting_result") {
      throw new Error("Expected awaiting-result fixture.");
    }

    result.transactions[0].lineItems[0].merchantUrl = `${MERCHANT.url}/`;

    expect(
      resolvePravaAwaitingContext(result, order, MERCHANT),
    ).toMatchObject({
      ok: true,
      lineItem: { transactionReferenceId: "line_test_001" },
    });
  });

  it.each([
    "merchant",
    "total",
    "product-name",
    "product-price",
    "missing-external-id",
    "duplicate-product",
  ] as const)(
    "identifies the unique transaction for a %s canonical mismatch",
    (kind) => {
      const order = orderFixture();
      const base = awaitingResult(order);

      if (base.status !== "awaiting_result") {
        throw new Error("Expected awaiting-result fixture.");
      }

      const firstTransaction = base.transactions[0];
      const firstLineItem = firstTransaction.lineItems[0];
      const firstProduct = firstLineItem.products[0];
      if (kind === "merchant") {
        firstLineItem.merchantUrl = "https://attacker.example";
      } else if (kind === "total") {
        firstLineItem.totalAmount = "0.01";
      } else if (kind === "product-name") {
        firstProduct.name = "Invented product";
      } else if (kind === "product-price") {
        firstProduct.unitPrice = "0.01";
      } else if (kind === "missing-external-id") {
        firstProduct.externalProductId = null;
      } else if (kind === "duplicate-product") {
        firstLineItem.products[1].externalProductId =
          firstProduct.externalProductId;
      }

      expect(
        resolvePravaAwaitingContext(base, order, MERCHANT),
      ).toEqual({
        ok: false,
        reason: "CANONICAL_CONTEXT_MISMATCH",
        transactionReference: "line_test_001",
      });
    },
  );

  it.each(["extra-line-item", "extra-transaction"] as const)(
    "does not select a transaction from an ambiguous %s structure",
    (kind) => {
      const order = orderFixture();
      const base = awaitingResult(order);

      if (base.status !== "awaiting_result") {
        throw new Error("Expected awaiting-result fixture.");
      }

      const firstTransaction = base.transactions[0];
      const firstLineItem = firstTransaction.lineItems[0];

      if (kind === "extra-line-item") {
        firstTransaction.lineItems.push(firstLineItem);
      } else {
        base.transactions.push(firstTransaction);
      }

      expect(
        resolvePravaAwaitingContext(base, order, MERCHANT),
      ).toEqual({
        ok: false,
        reason: "INVALID_PROVIDER_CONTEXT",
      });
    },
  );

  it("rejects non-awaiting provider states", () => {
    expect(
      resolvePravaAwaitingContext(
        {
          status: "pending",
          sessionId: "session_test_001",
          orderId: "order_test_001",
        },
        orderFixture(),
        MERCHANT,
      ),
    ).toEqual({
      ok: false,
      reason: "INVALID_PROVIDER_CONTEXT",
    });
  });
});
