import { describe, expect, it } from "vitest";

import { generateOutfits } from "@/lib/styling/generate";
import { verifyCheckoutOrder, type VerifiedOrder } from "@/lib/checkout/order";
import {
  CreatePaymentSessionInputSchema,
  HostedSessionSchema,
  PaymentResultSchema,
} from "@/lib/payments/types";

function verifiedOrderFixture(): VerifiedOrder {
  const generated = generateOutfits({
    occasion: "presentation",
    budgetCents: 20_000,
    topSize: "M",
    bottomSize: "M",
    shoeSize: "42",
    preferredColors: ["navy"],
    excludedColors: [],
    style: "smart_casual",
  });

  if (!generated.ok || !generated.outfits[0]) {
    throw new Error("Expected an outfit fixture.");
  }

  const outfit = generated.outfits[0];
  const verified = verifyCheckoutOrder({
    outfit: {
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
    },
  });

  if (!verified.ok) {
    throw new Error("Expected a verified order fixture.");
  }

  return verified.order;
}

describe("payment boundary schemas", () => {
  it("accepts the minimal server-verified create-session input", () => {
    expect(
      CreatePaymentSessionInputSchema.safeParse({
        order: verifiedOrderFixture(),
        email: "shopper@example.com",
        callbackUrl: "http://localhost:3000/checkout/callback",
      }).success,
    ).toBe(true);
  });

  it("rejects extra input and sensitive output fields", () => {
    expect(
      CreatePaymentSessionInputSchema.safeParse({
        order: verifiedOrderFixture(),
        email: "shopper@example.com",
        callbackUrl: "http://localhost:3000/checkout/callback",
        token: "must-not-cross-the-boundary",
      }).success,
    ).toBe(false);

    expect(
      HostedSessionSchema.safeParse({
        provider: "mock",
        sessionId: "11111111-1111-4111-8111-111111111111",
        hostedUrl:
          "http://localhost:3000/checkout/mock?sessionId=11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-07-26T10:05:00.000Z",
        email: "shopper@example.com",
      }).success,
    ).toBe(false);

    expect(
      PaymentResultSchema.safeParse({
        provider: "mock",
        sessionId: "11111111-1111-4111-8111-111111111111",
        status: "approved",
        orderReference: "FITORA-1234567890ABCDEF",
        cvv: "123",
      }).success,
    ).toBe(false);
  });

  it("requires result fields that agree with the status", () => {
    expect(
      PaymentResultSchema.safeParse({
        provider: "mock",
        sessionId: "session-1",
        status: "approved",
      }).success,
    ).toBe(false);
    expect(
      PaymentResultSchema.safeParse({
        provider: "mock",
        sessionId: "session-1",
        status: "pending",
        retryable: true,
      }).success,
    ).toBe(true);
  });
});
