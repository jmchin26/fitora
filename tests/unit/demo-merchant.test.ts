import { describe, expect, it } from "vitest";

import { verifyCheckoutOrder, type VerifiedOrder } from "@/lib/checkout/order";
import {
  createDemoMerchant,
  DemoMerchantCheckoutInputSchema,
} from "@/lib/merchant/demo-merchant";
import { generateOutfits } from "@/lib/styling/generate";

function verifiedOrderFixture(): VerifiedOrder {
  const generated = generateOutfits({
    occasion: "casual_event",
    budgetCents: 20_000,
    topSize: "M",
    bottomSize: "M",
    shoeSize: "42",
    preferredColors: ["olive"],
    excludedColors: [],
    style: "relaxed",
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

function checkoutInput(order = verifiedOrderFixture()) {
  return {
    order,
    sessionId: "session-merchant-test",
    context: {
      merchantId: order.merchantId,
      currency: order.currency,
      totalCents: order.totalCents,
    },
  } as const;
}

describe("Fitora demo merchant", () => {
  it("accepts matching authoritative merchant, currency, and total context", async () => {
    const result = await createDemoMerchant().checkout(
      checkoutInput(),
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      status: "accepted",
      orderReference: expect.stringMatching(/^FITORA-[A-F0-9]{16}$/),
    });
  });

  it("declines a total-context mismatch", async () => {
    const input = checkoutInput();
    const result = await createDemoMerchant().checkout(
      {
        ...input,
        context: {
          ...input.context,
          totalCents: input.context.totalCents + 1,
        },
      },
      new AbortController().signal,
    );

    expect(result).toEqual({
      status: "declined",
      reasonCode: "CONTEXT_MISMATCH",
    });
  });

  it("supports a deterministic server-configured forced decline", async () => {
    const result = await createDemoMerchant({ forceDecline: true }).checkout(
      checkoutInput(),
      new AbortController().signal,
    );

    expect(result).toEqual({
      status: "declined",
      reasonCode: "FORCED_DECLINE",
    });
  });

  it("returns the same synthetic order reference for duplicate sessions", async () => {
    const merchant = createDemoMerchant();
    const input = checkoutInput();
    const signal = new AbortController().signal;

    const first = await merchant.checkout(input, signal);
    const duplicate = await merchant.checkout(input, signal);

    expect(duplicate).toEqual(first);
  });

  it("rejects any credential-shaped data at its strict boundary", () => {
    expect(
      DemoMerchantCheckoutInputSchema.safeParse({
        ...checkoutInput(),
        credentials: {
          token: "secret",
          cvv: "123",
          expiry: "01/30",
        },
      }).success,
    ).toBe(false);
  });
});
