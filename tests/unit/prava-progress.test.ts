import { describe, expect, it } from "vitest";

import type { OutfitReference } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  PRAVA_PROGRESS_STAGE,
  PravaProgressTokenClaimsSchema,
  comparePravaProgressClaimsToCheckout,
  issuePravaProgressToken,
  matchesPravaProgressTransactionReference,
  verifyPravaProgressToken,
  verifyPravaProgressTokenForCheckout,
  type IssuePravaProgressTokenInput,
} from "@/lib/checkout/prava-progress";
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
const SESSION_JTI = "22222222-2222-4222-8222-222222222222";
const PROGRESS_JTI = "33333333-3333-4333-8333-333333333333";
const TRANSACTION_REFERENCE = "txn_fixture_8Yf52Z";
const SESSION_ID = "session-private-fixture";
const SENSITIVE_SESSION_TOKEN = "provider-session-token-secret";
const SENSITIVE_CARD_TOKEN = "one-time-card-token-value";
const SENSITIVE_DYNAMIC_CVV = "cvv-secret-927";
const SENSITIVE_EMAIL = "buyer@fitora.example";
const REFERENCE: OutfitReference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};

function verifiedOrder(
  reference: OutfitReference = REFERENCE,
): VerifiedOrder {
  const result = verifyCheckoutOrder({ outfit: reference });

  if (!result.ok) {
    throw new Error("The Prava progress order fixture is invalid.");
  }

  return result.order;
}

function checkoutClaims(
  order = verifiedOrder(),
  jti = CHECKOUT_JTI,
): CheckoutTokenClaims {
  const token = issueCheckoutToken(order, SECRET, {
    nowEpochSeconds: NOW,
    jti,
    ttlSeconds: 15 * 60,
  });
  const verified = verifyCheckoutToken(token, SECRET, {
    nowEpochSeconds: NOW,
  });

  if (!verified.ok) {
    throw new Error("The checkout claims fixture is invalid.");
  }

  return verified.claims;
}

function hostedSession(
  provider: HostedSession["provider"] = "prava",
): HostedSession {
  return {
    provider,
    sessionId: SESSION_ID,
    hostedUrl:
      "https://checkout.sandbox.prava.space/session-safe-fixture",
    expiresAt: new Date((NOW + 8 * 60) * 1_000).toISOString(),
  };
}

function sessionClaims(
  checkout = checkoutClaims(),
  jti = SESSION_JTI,
  provider: HostedSession["provider"] = "prava",
): PaymentSessionTokenClaims {
  const token = issuePaymentSessionToken(
    {
      attemptId: jti,
      checkoutClaims: checkout,
      order: verifiedOrder(),
      session: hostedSession(provider),
    },
    SECRET,
    {
      nowEpochSeconds: NOW,
      jti,
      ttlSeconds: 10 * 60,
    },
  );
  const verified = verifyPaymentSessionToken(token, SECRET, {
    nowEpochSeconds: NOW,
  });

  if (!verified.ok) {
    throw new Error("The payment session claims fixture is invalid.");
  }

  return verified.claims;
}

function issueApprovedProgress(): {
  token: string;
  checkout: CheckoutTokenClaims;
  session: PaymentSessionTokenClaims;
  order: VerifiedOrder;
} {
  const order = verifiedOrder();
  const checkout = checkoutClaims(order);
  const session = sessionClaims(checkout);
  const input: IssuePravaProgressTokenInput & {
    sessionToken: string;
    oneTimeCardToken: string;
    dynamicCvv: string;
    email: string;
  } = {
    checkoutClaims: checkout,
    sessionClaims: session,
    order,
    transactionReference: TRANSACTION_REFERENCE,
    expectedOutcome: {
      status: "approved",
      orderReference: "FITORA-PRAVA-001",
    },
    sessionToken: SENSITIVE_SESSION_TOKEN,
    oneTimeCardToken: SENSITIVE_CARD_TOKEN,
    dynamicCvv: SENSITIVE_DYNAMIC_CVV,
    email: SENSITIVE_EMAIL,
  };
  const token = issuePravaProgressToken(
    input,
    SECRET,
    {
      nowEpochSeconds: NOW + 30,
      jti: PROGRESS_JTI,
      ttlSeconds: 20 * 60,
    },
  );

  return { token, checkout, session, order };
}

describe("signed Prava retry progress", () => {
  it("issues strict safe claims bounded by checkout and session expiry", () => {
    const { token, checkout, session, order } =
      issueApprovedProgress();
    const verified = verifyPravaProgressTokenForCheckout(
      token,
      checkout,
      session,
      order,
      SECRET,
      { nowEpochSeconds: NOW + 30 },
    );

    expect(verified.ok).toBe(true);

    if (!verified.ok) {
      return;
    }

    expect(verified.claims).toMatchObject({
      version: "v1",
      type: "prava_progress",
      jti: PROGRESS_JTI,
      iat: NOW + 30,
      exp: NOW + 8 * 60,
      checkoutJti: CHECKOUT_JTI,
      paymentAttemptJti: SESSION_JTI,
      provider: "prava",
      stage: PRAVA_PROGRESS_STAGE,
      merchantId: "fitora-demo",
      currency: "USD",
      totalCents: order.totalCents,
      itemCount: 3,
      expectedOutcome: {
        status: "approved",
        orderReference: "FITORA-PRAVA-001",
      },
    });
    expect(
      verified.claims.transactionFingerprint,
    ).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      PravaProgressTokenClaimsSchema.safeParse(verified.claims).success,
    ).toBe(true);
  });

  it("supports only the fixed safe merchant-declined outcome", () => {
    const order = verifiedOrder();
    const checkout = checkoutClaims(order);
    const session = sessionClaims(checkout);
    const token = issuePravaProgressToken(
      {
        checkoutClaims: checkout,
        sessionClaims: session,
        order,
        transactionReference: TRANSACTION_REFERENCE,
        expectedOutcome: {
          status: "declined",
          reasonCode: "MERCHANT_DECLINED",
        },
      },
      SECRET,
      { nowEpochSeconds: NOW + 1 },
    );

    const verified = verifyPravaProgressToken(token, SECRET, {
      nowEpochSeconds: NOW + 1,
    });

    expect(verified.ok).toBe(true);

    if (verified.ok) {
      expect(verified.claims.expectedOutcome).toEqual({
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      });
    }
  });

  it("rejects checkout, payment-attempt, and order binding mismatches", () => {
    const { token, checkout, session, order } =
      issueApprovedProgress();
    const otherCheckout = checkoutClaims(
      order,
      "44444444-4444-4444-8444-444444444444",
    );
    const otherSession = sessionClaims(
      checkout,
      "55555555-5555-4555-8555-555555555555",
    );
    const otherOrder = verifiedOrder({
      ...REFERENCE,
      top: { productId: "top-02", selectedSize: "M" },
    });
    const verifiedProgress = verifyPravaProgressToken(
      token,
      SECRET,
      { nowEpochSeconds: NOW + 30 },
    );

    if (!verifiedProgress.ok) {
      throw new Error("The progress fixture is invalid.");
    }

    const checkoutMismatch =
      verifyPravaProgressTokenForCheckout(
        token,
        otherCheckout,
        session,
        order,
        SECRET,
        { nowEpochSeconds: NOW + 30 },
      );
    const attemptMismatch =
      verifyPravaProgressTokenForCheckout(
        token,
        checkout,
        otherSession,
        order,
        SECRET,
        { nowEpochSeconds: NOW + 30 },
      );
    const orderMismatch = comparePravaProgressClaimsToCheckout(
      verifiedProgress.claims,
      checkout,
      session,
      otherOrder,
    );

    expect(checkoutMismatch).toMatchObject({
      ok: false,
      error: { reason: "CHECKOUT_JTI" },
    });
    expect(attemptMismatch).toMatchObject({
      ok: false,
      error: { reason: "PAYMENT_ATTEMPT_JTI" },
    });
    expect(orderMismatch).toMatchObject({
      ok: false,
      error: { reason: "ORDER" },
    });
  });

  it("rejects tampering and treats the exact expiry boundary as expired", () => {
    const { token } = issueApprovedProgress();
    const [payload, signature] = token.split(".");
    const alteredSignature = `${signature.slice(0, -1)}${
      signature.endsWith("A") ? "B" : "A"
    }`;

    expect(
      verifyPravaProgressToken(
        `${payload}.${alteredSignature}`,
        SECRET,
        { nowEpochSeconds: NOW + 30 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyPravaProgressToken(token, SECRET, {
        nowEpochSeconds: NOW + 8 * 60,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });
  });

  it("matches only the original returned transaction reference", () => {
    const { token } = issueApprovedProgress();
    const verified = verifyPravaProgressToken(token, SECRET, {
      nowEpochSeconds: NOW + 30,
    });

    expect(verified.ok).toBe(true);

    if (!verified.ok) {
      return;
    }

    expect(
      matchesPravaProgressTransactionReference(
        verified.claims,
        TRANSACTION_REFERENCE,
        SECRET,
      ),
    ).toBe(true);
    expect(
      matchesPravaProgressTransactionReference(
        verified.claims,
        "txn_fixture_wrong",
        SECRET,
      ),
    ).toBe(false);
  });

  it("never serializes provider IDs, the transaction reference, credentials, or email", () => {
    const { token } = issueApprovedProgress();
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain(TRANSACTION_REFERENCE);
    expect(serialized).not.toContain(SESSION_ID);
    expect(serialized).not.toContain(SENSITIVE_SESSION_TOKEN);
    expect(serialized).not.toContain(SENSITIVE_CARD_TOKEN);
    expect(serialized).not.toContain(SENSITIVE_DYNAMIC_CVV);
    expect(serialized).not.toContain(SENSITIVE_EMAIL);

    for (const forbiddenField of [
      "txn_ref_id",
      "sessionId",
      "session_id",
      "session_token",
      "dynamic_cvv",
      "expiry_month",
      "expiry_year",
      "email",
    ]) {
      expect(payload).not.toHaveProperty(forbiddenField);
      expect(serialized).not.toContain(`"${forbiddenField}"`);
    }
  });

  it("refuses to issue Prava progress for a mock payment attempt", () => {
    const order = verifiedOrder();
    const checkout = checkoutClaims(order);

    expect(() =>
      issuePravaProgressToken(
        {
          checkoutClaims: checkout,
          sessionClaims: sessionClaims(
            checkout,
            SESSION_JTI,
            "mock",
          ),
          order,
          transactionReference: TRANSACTION_REFERENCE,
          expectedOutcome: {
            status: "approved",
            orderReference: "FITORA-PRAVA-001",
          },
        },
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toThrowError(/does not match the payment attempt/i);
  });
});
