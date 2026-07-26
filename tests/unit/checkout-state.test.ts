import { describe, expect, it } from "vitest";

import { getCatalogue } from "@/lib/catalogue/repository";
import { verifyCheckoutOrder } from "@/lib/checkout/order";
import { resolveCheckoutState } from "@/lib/checkout/state";
import { issueCheckoutToken } from "@/lib/checkout/token";

const secret = "checkout-state-unit-test-secret-123456789";

function verifiedOrder() {
  const products = getCatalogue();
  const top = products.find((product) => product.category === "top");
  const bottom = products.find((product) => product.category === "bottom");
  const shoes = products.find((product) => product.category === "shoes");

  if (!top || !bottom || !shoes) {
    throw new Error("The checkout state fixture requires all categories.");
  }

  const result = verifyCheckoutOrder({
    outfit: {
      top: { productId: top.id, selectedSize: top.sizes[0] },
      bottom: { productId: bottom.id, selectedSize: bottom.sizes[0] },
      shoes: { productId: shoes.id, selectedSize: shoes.sizes[0] },
    },
  });

  if (!result.ok) {
    throw new Error("The checkout state fixture must be purchasable.");
  }

  return result.order;
}

describe("resolveCheckoutState", () => {
  it("rehydrates a valid token into a fresh canonical order", () => {
    const order = verifiedOrder();
    const token = issueCheckoutToken(order, secret, {
      nowEpochSeconds: 1_000,
      jti: "11111111-1111-4111-8111-111111111111",
    });

    const result = resolveCheckoutState(token, secret, {
      nowEpochSeconds: 1_001,
    });

    expect(result).toEqual({
      ok: true,
      claims: expect.objectContaining({ reference: order.reference }),
      order,
    });
  });

  it("distinguishes missing, tampered, and expired state", () => {
    expect(resolveCheckoutState(undefined, secret)).toEqual({
      ok: false,
      reason: "MISSING",
    });

    expect(resolveCheckoutState("tampered.value", secret)).toEqual({
      ok: false,
      reason: "INVALID",
    });

    const token = issueCheckoutToken(verifiedOrder(), secret, {
      nowEpochSeconds: 1_000,
      ttlSeconds: 60,
      jti: "22222222-2222-4222-8222-222222222222",
    });
    expect(
      resolveCheckoutState(token, secret, { nowEpochSeconds: 1_060 }),
    ).toEqual({ ok: false, reason: "EXPIRED" });
  });
});
