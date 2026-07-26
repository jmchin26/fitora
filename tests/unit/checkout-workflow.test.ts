import { describe, expect, it } from "vitest";

import type { OutfitReference } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  CheckoutResultTokenClaimsSchema,
  PendingCheckoutResultTokenClaimsSchema,
  PaymentSessionTokenClaimsSchema,
  checkoutResultFromClaims,
  compareCheckoutResultToOrder,
  createSanitizedCheckoutResult,
  issueCheckoutResultToken,
  issuePendingCheckoutResult,
  issuePaymentSessionToken,
  issueTerminalCheckoutResult,
  verifyCheckoutResultToken,
  verifyPendingCheckoutResultToken,
  verifyPendingCheckoutResultTokenForCheckout,
  verifyPaymentSessionToken,
  verifyPaymentSessionTokenForCheckout,
  type PaymentSessionTokenClaims,
} from "@/lib/checkout/workflow";
import {
  StrictTokenIssueError,
  issueCheckoutToken,
  verifyCheckoutToken,
  type CheckoutTokenClaims,
} from "@/lib/checkout/token";
import type {
  HostedSession,
  PaymentResult,
} from "@/lib/payments/types";

const NOW = 1_800_000_000;
const SECRET = "0123456789abcdef0123456789abcdef";
const CHECKOUT_JTI = "11111111-1111-4111-8111-111111111111";
const OTHER_CHECKOUT_JTI =
  "22222222-2222-4222-8222-222222222222";
const SESSION_TOKEN_JTI =
  "33333333-3333-4333-8333-333333333333";
const RESULT_TOKEN_JTI =
  "44444444-4444-4444-8444-444444444444";
const PENDING_RESULT_TOKEN_JTI =
  "55555555-5555-4555-8555-555555555555";
const REFERENCE: OutfitReference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};

function verifiedOrder(): VerifiedOrder {
  const result = verifyCheckoutOrder({ outfit: REFERENCE });

  if (!result.ok) {
    throw new Error("The checkout workflow fixture is invalid.");
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
    throw new Error("The checkout token fixture is invalid.");
  }

  return verified.claims;
}

function hostedSession(
  overrides: Partial<HostedSession> = {},
): HostedSession {
  return {
    provider: "mock",
    sessionId: "session-123",
    hostedUrl:
      "https://fitora.example/checkout/mock?sessionId=session-123",
    expiresAt: new Date((NOW + 15 * 60) * 1_000).toISOString(),
    ...overrides,
  };
}

function approvedPaymentResult(): PaymentResult {
  return {
    provider: "mock",
    sessionId: "session-123",
    status: "approved",
    orderReference: "FITORA-ABC123",
  };
}

function pendingPaymentResult(
  sessionId = "session-123",
): PaymentResult {
  return {
    provider: "mock",
    sessionId,
    status: "pending",
    retryable: true,
  };
}

function paymentSessionClaims(
  checkout = checkoutClaims(),
  session = hostedSession(),
  jti = SESSION_TOKEN_JTI,
): PaymentSessionTokenClaims {
  const token = issuePaymentSessionToken(
    { checkoutClaims: checkout, session },
    SECRET,
    { nowEpochSeconds: NOW, jti },
  );
  const verified = verifyPaymentSessionToken(token, SECRET, {
    nowEpochSeconds: NOW,
  });

  if (!verified.ok) {
    throw new Error("The payment-session fixture is invalid.");
  }

  return verified.claims;
}

describe("payment-session workflow state", () => {
  it("binds a provider session to the reviewed checkout JTI", () => {
    const token = issuePaymentSessionToken(
      {
        checkoutClaims: checkoutClaims(),
        session: hostedSession(),
      },
      SECRET,
      {
        nowEpochSeconds: NOW,
        jti: SESSION_TOKEN_JTI,
      },
    );
    const verified = verifyPaymentSessionTokenForCheckout(
      token,
      checkoutClaims(),
      SECRET,
      { nowEpochSeconds: NOW },
    );

    expect(verified).toEqual({
      ok: true,
      claims: {
        version: "v1",
        type: "payment_session",
        jti: SESSION_TOKEN_JTI,
        iat: NOW,
        exp: NOW + 10 * 60,
        checkoutJti: CHECKOUT_JTI,
        provider: "mock",
        sessionId: "session-123",
      },
    });
  });

  it("caps expiry at the checkout and provider session boundaries", () => {
    const providerExpiry = NOW + 90;
    const token = issuePaymentSessionToken(
      {
        checkoutClaims: checkoutClaims(),
        session: hostedSession({
          expiresAt: new Date(providerExpiry * 1_000).toISOString(),
        }),
      },
      SECRET,
      {
        nowEpochSeconds: NOW,
        jti: SESSION_TOKEN_JTI,
        ttlSeconds: 20 * 60,
      },
    );

    expect(
      verifyPaymentSessionToken(token, SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: true,
      claims: { exp: providerExpiry },
    });
    expect(
      verifyPaymentSessionToken(token, SECRET, {
        nowEpochSeconds: providerExpiry,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });
  });

  it("rejects tampering and a valid token bound to another checkout", () => {
    const token = issuePaymentSessionToken(
      {
        checkoutClaims: checkoutClaims(),
        session: hostedSession(),
      },
      SECRET,
      {
        nowEpochSeconds: NOW,
        jti: SESSION_TOKEN_JTI,
      },
    );
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Record<string, unknown>),
        sessionId: "attacker-session",
      }),
      "utf8",
    ).toString("base64url");

    expect(
      verifyPaymentSessionToken(
        `${tamperedPayload}.${signature}`,
        SECRET,
        { nowEpochSeconds: NOW },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyPaymentSessionTokenForCheckout(
        token,
        checkoutClaims(OTHER_CHECKOUT_JTI),
        SECRET,
        { nowEpochSeconds: NOW },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PAYMENT_SESSION_BINDING_MISMATCH",
        reason: "CHECKOUT_JTI",
      },
    });
  });

  it("enforces strict claims and a maximum 20-minute lifetime", () => {
    expect(() =>
      issuePaymentSessionToken(
        {
          checkoutClaims: checkoutClaims(),
          session: hostedSession(),
        },
        SECRET,
        {
          nowEpochSeconds: NOW,
          jti: SESSION_TOKEN_JTI,
          ttlSeconds: 20 * 60 + 1,
        },
      ),
    ).toThrow(StrictTokenIssueError);
    expect(
      PaymentSessionTokenClaimsSchema.safeParse({
        version: "v1",
        type: "payment_session",
        jti: SESSION_TOKEN_JTI,
        iat: NOW,
        exp: NOW + 60,
        checkoutJti: CHECKOUT_JTI,
        provider: "mock",
        sessionId: "session-123",
        email: "customer@example.com",
      }).success,
    ).toBe(false);
  });
});

describe("sanitized terminal checkout-result state", () => {
  it("issues an approved result without provider-session or customer data", () => {
    const issued = issueTerminalCheckoutResult(
      verifiedOrder(),
      approvedPaymentResult(),
      SECRET,
      {
        nowEpochSeconds: NOW,
        jti: RESULT_TOKEN_JTI,
      },
    );
    const verified = verifyCheckoutResultToken(
      issued.token,
      SECRET,
      { nowEpochSeconds: NOW },
    );

    expect(issued.result).toEqual({
      provider: "mock",
      status: "approved",
      orderReference: "FITORA-ABC123",
      currency: "USD",
      totalCents: verifiedOrder().totalCents,
      itemCount: 3,
      completedAt: new Date(NOW * 1_000).toISOString(),
    });
    expect(verified).toMatchObject({
      ok: true,
      claims: {
        version: "v1",
        type: "checkout_result",
        jti: RESULT_TOKEN_JTI,
        iat: NOW,
        exp: NOW + 60 * 60,
        ...issued.result,
      },
    });

    const decodedPayload = Buffer.from(
      issued.token.split(".")[0],
      "base64url",
    ).toString("utf8");

    expect(decodedPayload).not.toContain("sessionId");
    expect(decodedPayload).not.toContain("session-123");
    expect(decodedPayload).not.toContain("email");
    expect(decodedPayload).not.toContain("token");

    if (!verified.ok) {
      throw new Error("The result token fixture is invalid.");
    }

    expect(checkoutResultFromClaims(verified.claims)).toEqual(
      issued.result,
    );
  });

  it("uses a strict declined variant without an order reference", () => {
    const declined: PaymentResult = {
      provider: "mock",
      sessionId: "session-123",
      status: "declined",
      reasonCode: "CUSTOMER_DECLINED",
    };
    const result = createSanitizedCheckoutResult(
      verifiedOrder(),
      declined,
      { nowEpochSeconds: NOW },
    );

    expect(result).toEqual({
      provider: "mock",
      status: "declined",
      reasonCode: "CUSTOMER_DECLINED",
      currency: "USD",
      totalCents: verifiedOrder().totalCents,
      itemCount: 3,
      completedAt: new Date(NOW * 1_000).toISOString(),
    });
    expect(
      CheckoutResultTokenClaimsSchema.safeParse({
        version: "v1",
        type: "checkout_result",
        jti: RESULT_TOKEN_JTI,
        iat: NOW,
        exp: NOW + 60,
        ...result,
        orderReference: "SHOULD-NOT-EXIST",
      }).success,
    ).toBe(false);
  });

  it("refuses pending results and lifetimes over one hour", () => {
    const pending: PaymentResult = {
      provider: "mock",
      sessionId: "session-123",
      status: "pending",
      retryable: true,
    };

    expect(() =>
      createSanitizedCheckoutResult(verifiedOrder(), pending, {
        nowEpochSeconds: NOW,
      }),
    ).toThrow(StrictTokenIssueError);

    const result = createSanitizedCheckoutResult(
      verifiedOrder(),
      approvedPaymentResult(),
      { nowEpochSeconds: NOW },
    );

    expect(() =>
      issueCheckoutResultToken(result, SECRET, {
        nowEpochSeconds: NOW,
        jti: RESULT_TOKEN_JTI,
        ttlSeconds: 60 * 60 + 1,
      }),
    ).toThrow(StrictTokenIssueError);
  });

  it("detects result tampering, expiry, and order-total changes", () => {
    const issued = issueTerminalCheckoutResult(
      verifiedOrder(),
      approvedPaymentResult(),
      SECRET,
      {
        nowEpochSeconds: NOW,
        jti: RESULT_TOKEN_JTI,
      },
    );
    const [payload, signature] = issued.token.split(".");
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
      verifyCheckoutResultToken(
        `${tamperedPayload}.${signature}`,
        SECRET,
        { nowEpochSeconds: NOW },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyCheckoutResultToken(issued.token, SECRET, {
        nowEpochSeconds: NOW + 60 * 60,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });

    expect(
      compareCheckoutResultToOrder(issued.result, {
        ...verifiedOrder(),
        subtotalCents: verifiedOrder().subtotalCents + 1,
        totalCents: verifiedOrder().totalCents + 1,
        items: [
          {
            ...verifiedOrder().items[0],
            unitPriceCents:
              verifiedOrder().items[0].unitPriceCents + 1,
            lineTotalCents:
              verifiedOrder().items[0].lineTotalCents + 1,
          },
          verifiedOrder().items[1],
          verifiedOrder().items[2],
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHECKOUT_RESULT_ORDER_MISMATCH",
        reason: "TOTAL",
      },
    });
  });
});

describe("signed pending checkout-result marker", () => {
  it("contains only strict sanitized facts and binds to one payment attempt", () => {
    const checkout = checkoutClaims();
    const session = paymentSessionClaims(checkout);
    const issued = issuePendingCheckoutResult(
      {
        checkoutClaims: checkout,
        sessionClaims: session,
        order: verifiedOrder(),
        paymentResult: pendingPaymentResult(),
      },
      SECRET,
      {
        nowEpochSeconds: NOW + 1,
        jti: PENDING_RESULT_TOKEN_JTI,
      },
    );
    const verified = verifyPendingCheckoutResultTokenForCheckout(
      issued.token,
      checkout,
      session,
      verifiedOrder(),
      SECRET,
      { nowEpochSeconds: NOW + 1 },
    );
    const decoded = JSON.parse(
      Buffer.from(issued.token.split(".")[0], "base64url").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(issued.marker).toEqual({
      status: "pending",
      provider: "mock",
      currency: "USD",
      totalCents: verifiedOrder().totalCents,
      itemCount: 3,
    });
    expect(verified).toMatchObject({
      ok: true,
      claims: {
        type: "checkout_pending_result",
        checkoutJti: CHECKOUT_JTI,
        paymentAttemptJti: SESSION_TOKEN_JTI,
        status: "pending",
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
        "paymentAttemptJti",
        "provider",
        "status",
        "totalCents",
        "type",
        "version",
      ].sort(),
    );
    expect(JSON.stringify(decoded)).not.toMatch(
      /session|session-123|email|hostedUrl|authorization|secret|token/i,
    );
    expect(
      PendingCheckoutResultTokenClaimsSchema.safeParse({
        ...decoded,
        email: "customer@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects non-pending output, mismatched provider output, tampering, and excessive lifetime", () => {
    const checkout = checkoutClaims();
    const session = paymentSessionClaims(checkout);
    const input = {
      checkoutClaims: checkout,
      sessionClaims: session,
      order: verifiedOrder(),
    };

    expect(() =>
      issuePendingCheckoutResult(
        { ...input, paymentResult: approvedPaymentResult() },
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toThrow(StrictTokenIssueError);
    expect(() =>
      issuePendingCheckoutResult(
        {
          ...input,
          paymentResult: pendingPaymentResult("another-session"),
        },
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toThrow(StrictTokenIssueError);
    expect(() =>
      issuePendingCheckoutResult(
        { ...input, paymentResult: pendingPaymentResult() },
        SECRET,
        {
          nowEpochSeconds: NOW + 1,
          ttlSeconds: 20 * 60 + 1,
        },
      ),
    ).toThrow(StrictTokenIssueError);

    const issued = issuePendingCheckoutResult(
      { ...input, paymentResult: pendingPaymentResult() },
      SECRET,
      {
        nowEpochSeconds: NOW + 1,
        jti: PENDING_RESULT_TOKEN_JTI,
      },
    );
    const [payload, signature] = issued.token.split(".");
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
      verifyPendingCheckoutResultToken(
        `${tamperedPayload}.${signature}`,
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyPendingCheckoutResultToken(issued.token, SECRET, {
        nowEpochSeconds: NOW + 10 * 60,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });
  });

  it("does not replay a pending marker onto a new session for the same checkout", () => {
    const checkout = checkoutClaims();
    const firstSession = paymentSessionClaims(checkout);
    const issued = issuePendingCheckoutResult(
      {
        checkoutClaims: checkout,
        sessionClaims: firstSession,
        order: verifiedOrder(),
        paymentResult: pendingPaymentResult(),
      },
      SECRET,
      {
        nowEpochSeconds: NOW + 1,
        jti: PENDING_RESULT_TOKEN_JTI,
      },
    );
    const secondSession = paymentSessionClaims(
      checkout,
      hostedSession({ sessionId: "session-456" }),
      "66666666-6666-4666-8666-666666666666",
    );

    expect(
      verifyPendingCheckoutResultTokenForCheckout(
        issued.token,
        checkout,
        secondSession,
        verifiedOrder(),
        SECRET,
        { nowEpochSeconds: NOW + 1 },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "PENDING_CHECKOUT_RESULT_BINDING_MISMATCH",
      },
    });
  });
});
