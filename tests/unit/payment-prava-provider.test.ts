import { describe, expect, it, vi } from "vitest";

import { verifyCheckoutOrder } from "@/lib/checkout/order";
import type { PravaClient } from "@/lib/payments/prava";
import { createPravaPaymentProvider } from "@/lib/payments/prava-provider";
import { PaymentProviderError } from "@/lib/payments/types";

function orderFixture() {
  const result = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!result.ok) {
    throw new Error("Expected a canonical provider fixture.");
  }

  return result.order;
}

function clientDouble(): PravaClient {
  return {
    createSession: vi.fn().mockResolvedValue({
      sessionId: "session_test_001",
      hostedUrl:
        "https://sandbox.collect.prava.space/?session_token=TEST_ONLY",
      orderId: "order_test_001",
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000).toISOString(),
    }),
    getPaymentResult: vi.fn(),
    pollPaymentResult: vi.fn(),
    reportStatus: vi.fn(),
  };
}

describe("Prava payment-provider adapter", () => {
  it("maps only the public hosted-session fields", async () => {
    const client = clientDouble();
    const provider = createPravaPaymentProvider({ client });
    const result = await provider.createSession(
      {
        order: orderFixture(),
        email: "shopper@example.com",
        callbackUrl: "https://fitora.example/checkout/callback",
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      provider: "prava",
      sessionId: "session_test_001",
      hostedUrl:
        "https://sandbox.collect.prava.space/?session_token=TEST_ONLY",
    });
    expect(client.createSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/email|orderId/i);
  });

  it("does not expose a browser-driven real-payment finalize method", async () => {
    const provider = createPravaPaymentProvider({
      client: clientDouble(),
    });

    const caught = await provider
      .finalize(
        {
          order: orderFixture(),
          sessionId: "session_test_001",
          decision: "approve",
        },
        new AbortController().signal,
      )
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(PaymentProviderError);
    expect(caught).toMatchObject({
      provider: "prava",
      reason: "NOT_IMPLEMENTED",
    });
  });

  it("does not call Prava after the request has already been aborted", async () => {
    const client = clientDouble();
    const provider = createPravaPaymentProvider({ client });
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.createSession(
        {
          order: orderFixture(),
          email: "shopper@example.com",
          callbackUrl: "https://fitora.example/checkout/callback",
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({
      provider: "prava",
      reason: "ABORTED",
    });
    expect(client.createSession).not.toHaveBeenCalled();
  });
});
