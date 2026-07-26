import { describe, expect, it } from "vitest";

import { verifyCheckoutOrder, type VerifiedOrder } from "@/lib/checkout/order";
import { createDemoMerchant } from "@/lib/merchant/demo-merchant";
import { createMockPaymentProvider } from "@/lib/payments/mock";
import { PaymentProviderError } from "@/lib/payments/types";
import { generateOutfits } from "@/lib/styling/generate";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function verifiedOrderFixture(): VerifiedOrder {
  const generated = generateOutfits({
    occasion: "interview",
    budgetCents: 20_000,
    topSize: "M",
    bottomSize: "M",
    shoeSize: "42",
    preferredColors: ["navy"],
    excludedColors: [],
    style: "minimal",
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

function mockProvider(forceDecline = false) {
  return createMockPaymentProvider({
    appUrl: "http://localhost:3000",
    merchant: createDemoMerchant({ forceDecline }),
    now: () => new Date("2026-07-26T10:00:00.000Z"),
    randomUUID: () => SESSION_ID,
    expiresInMs: 60_000,
  });
}

describe("mock payment provider", () => {
  it("creates an explicitly mock, short-lived same-origin hosted session", async () => {
    const provider = mockProvider();
    const session = await provider.createSession(
      {
        order: verifiedOrderFixture(),
        email: "sensitive-shopper@example.com",
        callbackUrl: "http://localhost:3000/checkout/callback",
      },
      new AbortController().signal,
    );

    expect(provider.name).toBe("mock");
    expect(session).toEqual({
      provider: "mock",
      sessionId: SESSION_ID,
      hostedUrl: `http://localhost:3000/checkout/mock?sessionId=${SESSION_ID}`,
      expiresAt: "2026-07-26T10:01:00.000Z",
    });
    expect(JSON.stringify(session)).not.toContain("sensitive-shopper");
  });

  it("rejects callbacks outside the verified app origin", async () => {
    const provider = mockProvider();

    await expect(
      provider.createSession(
        {
          order: verifiedOrderFixture(),
          email: "shopper@example.com",
          callbackUrl: "https://attacker.example/steal",
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      reason: "INVALID_INPUT",
    });

    await expect(
      provider.createSession(
        {
          order: verifiedOrderFixture(),
          email: "shopper@example.com",
          callbackUrl:
            "http://embedded:password@localhost:3000/checkout/callback",
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      reason: "INVALID_INPUT",
    });
  });

  it("returns distinct approve, decline, and pending results", async () => {
    const provider = mockProvider();
    const order = verifiedOrderFixture();
    const signal = new AbortController().signal;

    await expect(
      provider.finalize(
        { order, sessionId: SESSION_ID, decision: "approve" },
        signal,
      ),
    ).resolves.toMatchObject({
      provider: "mock",
      status: "approved",
      orderReference: expect.stringMatching(/^FITORA-[A-F0-9]{16}$/),
    });
    await expect(
      provider.finalize(
        { order, sessionId: SESSION_ID, decision: "decline" },
        signal,
      ),
    ).resolves.toEqual({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "declined",
      reasonCode: "CUSTOMER_DECLINED",
    });
    await expect(
      provider.finalize(
        { order, sessionId: SESSION_ID, decision: "pending" },
        signal,
      ),
    ).resolves.toEqual({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "pending",
      retryable: true,
    });
  });

  it("maps a server-configured merchant decline without exposing why", async () => {
    const result = await mockProvider(true).finalize(
      {
        order: verifiedOrderFixture(),
        sessionId: SESSION_ID,
        decision: "approve",
      },
      new AbortController().signal,
    );

    expect(result).toEqual({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "declined",
      reasonCode: "MERCHANT_DECLINED",
    });
  });

  it("returns a deterministic order reference for duplicate finalization", async () => {
    const provider = mockProvider();
    const input = {
      order: verifiedOrderFixture(),
      sessionId: SESSION_ID,
      decision: "approve" as const,
    };
    const signal = new AbortController().signal;

    const first = await provider.finalize(input, signal);
    const duplicate = await provider.finalize(input, signal);

    expect(duplicate).toEqual(first);
  });

  it("reports cancellation as a typed provider error", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      mockProvider().finalize(
        {
          order: verifiedOrderFixture(),
          sessionId: SESSION_ID,
          decision: "approve",
        },
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(PaymentProviderError);
    await expect(
      mockProvider().finalize(
        {
          order: verifiedOrderFixture(),
          sessionId: SESSION_ID,
          decision: "approve",
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ reason: "ABORTED" });
  });

  it("does not serialize email, card data, credentials, or tokens", async () => {
    const provider = mockProvider();
    const session = await provider.createSession(
      {
        order: verifiedOrderFixture(),
        email: "private-email@example.com",
        callbackUrl: "http://localhost:3000/checkout/callback",
      },
      new AbortController().signal,
    );
    const result = await provider.finalize(
      {
        order: verifiedOrderFixture(),
        sessionId: session.sessionId,
        decision: "approve",
      },
      new AbortController().signal,
    );
    const serialized = JSON.stringify({ session, result }).toLowerCase();

    expect(serialized).not.toContain("private-email");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("cvv");
    expect(serialized).not.toContain("expiry");
    expect(serialized).not.toContain("token");
  });
});
