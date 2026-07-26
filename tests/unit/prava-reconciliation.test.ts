import { describe, expect, it } from "vitest";

import type { OutfitReference } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  PravaReconciliationTokenClaimsSchema,
  comparePravaReconciliationClaimsToCheckout,
  issuePravaReconciliationToken,
  verifyPravaReconciliationToken,
  verifyPravaReconciliationTokenForCheckout,
} from "@/lib/checkout/prava-reconciliation";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
  type CheckoutTokenClaims,
} from "@/lib/checkout/token";
import {
  issuePaymentSessionToken,
  verifyPaymentSessionToken,
  type PaymentSessionTokenClaims,
} from "@/lib/checkout/workflow";
import type { HostedSession } from "@/lib/payments/types";

const NOW = 1_800_000_000;
const SECRET = "0123456789abcdef0123456789abcdef";
const CHECKOUT_JTI = "11111111-1111-4111-8111-111111111111";
const OTHER_CHECKOUT_JTI =
  "22222222-2222-4222-8222-222222222222";
const SESSION_JTI = "33333333-3333-4333-8333-333333333333";
const OTHER_SESSION_JTI =
  "44444444-4444-4444-8444-444444444444";
const RECONCILIATION_JTI =
  "55555555-5555-4555-8555-555555555555";
const REFERENCE: OutfitReference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};

function verifiedOrder(): VerifiedOrder {
  const result = verifyCheckoutOrder({ outfit: REFERENCE });

  if (!result.ok) {
    throw new Error("The checkout fixture is invalid.");
  }

  return result.order;
}

function checkoutClaims(
  jti = CHECKOUT_JTI,
): CheckoutTokenClaims {
  const token = issueCheckoutToken(verifiedOrder(), SECRET, {
    nowEpochSeconds: NOW,
    jti,
    ttlSeconds: 15 * 60,
  });
  const verified = verifyCheckoutToken(token, SECRET, {
    nowEpochSeconds: NOW,
  });

  if (!verified.ok) {
    throw new Error("The checkout-token fixture is invalid.");
  }

  return verified.claims;
}

function hostedSession(
  overrides: Partial<HostedSession> = {},
): HostedSession {
  return {
    provider: "prava",
    sessionId: "prava-session-123",
    hostedUrl:
      "https://checkout.prava.example/session/prava-session-123",
    expiresAt: new Date((NOW + 12 * 60) * 1_000).toISOString(),
    ...overrides,
  };
}

function paymentSessionClaims(
  checkout = checkoutClaims(),
  jti = SESSION_JTI,
  session = hostedSession(),
): PaymentSessionTokenClaims {
  const token = issuePaymentSessionToken(
    {
      attemptId: jti,
      checkoutClaims: checkout,
      order: verifiedOrder(),
      session,
    },
    SECRET,
    { nowEpochSeconds: NOW, jti, ttlSeconds: 20 * 60 },
  );
  const verified = verifyPaymentSessionToken(token, SECRET, {
    nowEpochSeconds: NOW,
  });

  if (!verified.ok) {
    throw new Error("The payment-session fixture is invalid.");
  }

  return verified.claims;
}

function issueFixture() {
  const checkout = checkoutClaims();
  const session = paymentSessionClaims(checkout);
  const order = verifiedOrder();
  const token = issuePravaReconciliationToken(
    {
      checkoutClaims: checkout,
      sessionClaims: session,
      order,
    },
    SECRET,
    {
      nowEpochSeconds: NOW + 1,
      jti: RECONCILIATION_JTI,
      ttlSeconds: 20 * 60,
    },
  );

  return { checkout, session, order, token };
}

describe("signed Prava reconciliation marker", () => {
  it("contains only safe facts and is capped by review/session expiry", () => {
    const { checkout, session, order, token } = issueFixture();
    const verified = verifyPravaReconciliationTokenForCheckout(
      token,
      checkout,
      session,
      order,
      SECRET,
      { nowEpochSeconds: NOW + 1 },
    );
    const decoded = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(verified).toEqual({
      ok: true,
      claims: {
        version: "v1",
        type: "prava_reconciliation",
        jti: RECONCILIATION_JTI,
        iat: NOW + 1,
        exp: session.exp,
        checkoutJti: CHECKOUT_JTI,
        paymentAttemptJti: SESSION_JTI,
        provider: "prava",
        stage: "reconciliation_required",
        merchantId: "fitora-demo",
        currency: "USD",
        totalCents: order.totalCents,
        itemCount: 3,
      },
    });
    expect(Object.keys(decoded).sort()).toEqual(
      [
        "checkoutJti",
        "currency",
        "exp",
        "iat",
        "itemCount",
        "jti",
        "merchantId",
        "paymentAttemptJti",
        "provider",
        "stage",
        "totalCents",
        "type",
        "version",
      ].sort(),
    );
    expect(JSON.stringify(decoded)).not.toMatch(
      /prava-session-123|sessionId|txn|transaction|credential|dynamic|cvv|expiry|email|error|authorization|secret|hostedUrl|token/i,
    );
    expect(
      PravaReconciliationTokenClaimsSchema.safeParse({
        ...decoded,
        email: "customer@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects tampering and expires at its signed boundary", () => {
    const { token, session } = issueFixture();
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Record<string, unknown>),
        totalCents: 1,
      }),
      "utf8",
    ).toString("base64url");

    expect(
      verifyPravaReconciliationToken(
        `${tamperedPayload}.${signature}`,
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyPravaReconciliationToken(token, SECRET, {
        nowEpochSeconds: session.exp,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });
  });

  it("rejects another checkout, payment attempt, provider, and order", () => {
    const { checkout, session, order, token } = issueFixture();
    const verifiedMarker = verifyPravaReconciliationToken(
      token,
      SECRET,
      { nowEpochSeconds: NOW + 1 },
    );
    const otherCheckout = checkoutClaims(OTHER_CHECKOUT_JTI);
    const otherSession = paymentSessionClaims(
      checkout,
      OTHER_SESSION_JTI,
      hostedSession({ sessionId: "prava-session-456" }),
    );
    const mockSession = {
      ...session,
      provider: "mock" as const,
    };
    const changedOrder = {
      ...order,
      subtotalCents: order.subtotalCents + 1,
      totalCents: order.totalCents + 1,
      items: [
        {
          ...order.items[0],
          unitPriceCents: order.items[0].unitPriceCents + 1,
          lineTotalCents: order.items[0].lineTotalCents + 1,
        },
        order.items[1],
        order.items[2],
      ],
    } satisfies VerifiedOrder;

    if (!verifiedMarker.ok) {
      throw new Error("The reconciliation-marker fixture is invalid.");
    }

    expect(
      verifyPravaReconciliationTokenForCheckout(
        token,
        otherCheckout,
        session,
        order,
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PRAVA_RECONCILIATION_BINDING_MISMATCH",
        reason: "CHECKOUT_JTI",
      },
    });
    expect(
      verifyPravaReconciliationTokenForCheckout(
        token,
        checkout,
        otherSession,
        order,
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PRAVA_RECONCILIATION_BINDING_MISMATCH",
        reason: "PAYMENT_ATTEMPT_JTI",
      },
    });
    expect(
      comparePravaReconciliationClaimsToCheckout(
        verifiedMarker.claims,
        checkout,
        mockSession,
        order,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PRAVA_RECONCILIATION_BINDING_MISMATCH",
        reason: "PROVIDER",
      },
    });
    expect(
      verifyPravaReconciliationTokenForCheckout(
        token,
        checkout,
        session,
        changedOrder,
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PRAVA_RECONCILIATION_BINDING_MISMATCH",
        reason: "ORDER",
      },
    });
  });

  it("refuses non-Prava issuance and excessive lifetime requests", () => {
    const checkout = checkoutClaims();
    const order = verifiedOrder();
    const mockSession = paymentSessionClaims(
      checkout,
      SESSION_JTI,
      hostedSession({ provider: "mock" }),
    );

    expect(() =>
      issuePravaReconciliationToken(
        {
          checkoutClaims: checkout,
          sessionClaims: mockSession,
          order,
        },
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toThrow("does not match the payment attempt");
    expect(() =>
      issuePravaReconciliationToken(
        {
          checkoutClaims: checkout,
          sessionClaims: paymentSessionClaims(checkout),
          order,
        },
        SECRET,
        {
          nowEpochSeconds: NOW + 1,
          ttlSeconds: 20 * 60 + 1,
        },
      ),
    ).toThrow("claims are invalid");
  });
});
