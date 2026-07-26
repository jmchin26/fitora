import { describe, expect, it } from "vitest";

import { verifyCheckoutOrder } from "@/lib/checkout/order";
import { resolveCheckoutResultState } from "@/lib/checkout/result-state";
import { issueCheckoutToken, verifyCheckoutToken } from "@/lib/checkout/token";
import {
  issuePendingCheckoutResult,
  issuePaymentSessionToken,
  issueTerminalCheckoutResult,
  verifyPaymentSessionToken,
} from "@/lib/checkout/workflow";

const secret = "checkout-result-state-test-secret-123456";
const now = 2_000_000_000;

function order() {
  const result = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!result.ok) {
    throw new Error("Result-state fixture must produce a valid order.");
  }

  return result.order;
}

function activeTokens(
  options: {
    sessionId?: string;
    sessionJti?: string;
  } = {},
) {
  const verifiedOrder = order();
  const reviewToken = issueCheckoutToken(verifiedOrder, secret, {
    nowEpochSeconds: now,
    ttlSeconds: 300,
    jti: "11111111-1111-4111-8111-111111111111",
  });
  const checkout = verifyCheckoutToken(reviewToken, secret, {
    nowEpochSeconds: now,
  });

  if (!checkout.ok) {
    throw new Error("Result-state fixture checkout token must verify.");
  }

  const sessionToken = issuePaymentSessionToken(
    {
      checkoutClaims: checkout.claims,
      session: {
        provider: "mock",
        sessionId:
          options.sessionId ?? "session-result-state",
        hostedUrl: "http://localhost:3000/checkout/mock",
        expiresAt: new Date((now + 240) * 1_000).toISOString(),
      },
    },
    secret,
    {
      nowEpochSeconds: now,
      jti:
        options.sessionJti ??
        "22222222-2222-4222-8222-222222222222",
    },
  );
  const session = verifyPaymentSessionToken(sessionToken, secret, {
    nowEpochSeconds: now,
  });

  if (!session.ok) {
    throw new Error("Result-state fixture session token must verify.");
  }

  return {
    reviewToken,
    sessionToken,
    checkoutClaims: checkout.claims,
    sessionClaims: session.claims,
  };
}

function pendingMarker(tokens: ReturnType<typeof activeTokens>): string {
  return issuePendingCheckoutResult(
    {
      checkoutClaims: tokens.checkoutClaims,
      sessionClaims: tokens.sessionClaims,
      order: order(),
      paymentResult: {
        provider: "mock",
        sessionId: tokens.sessionClaims.sessionId,
        status: "pending",
        retryable: true,
      },
    },
    secret,
    {
      nowEpochSeconds: now + 1,
      jti: "55555555-5555-4555-8555-555555555555",
    },
  ).token;
}

describe("resolveCheckoutResultState", () => {
  it("returns a signed terminal result without requiring transient state", () => {
    const issued = issueTerminalCheckoutResult(
      order(),
      {
        provider: "mock",
        sessionId: "session-terminal",
        status: "approved",
        orderReference: "FITORA-RESULT-STATE",
      },
      secret,
      {
        nowEpochSeconds: now,
        jti: "33333333-3333-4333-8333-333333333333",
      },
    );

    expect(
      resolveCheckoutResultState(
        { resultToken: issued.token },
        secret,
        { nowEpochSeconds: now + 1 },
      ),
    ).toEqual({ status: "approved", result: issued.result });
  });

  it("returns awaiting payment for a created session that was not finalized", () => {
    const tokens = activeTokens();
    const result = resolveCheckoutResultState(tokens, secret, {
      nowEpochSeconds: now + 1,
    });

    expect(result).toMatchObject({
      status: "awaiting_payment",
      provider: "mock",
      order: { totalCents: expect.any(Number) },
    });
  });

  it("returns pending only with a valid marker bound to the current payment attempt", () => {
    const tokens = activeTokens();
    const result = resolveCheckoutResultState(
      { ...tokens, resultToken: pendingMarker(tokens) },
      secret,
      { nowEpochSeconds: now + 2 },
    );

    expect(result).toMatchObject({
      status: "pending",
      provider: "mock",
      order: { totalCents: expect.any(Number) },
    });
  });

  it("does not replay an old pending marker onto a new session for the same checkout", () => {
    const firstAttempt = activeTokens();
    const secondAttempt = activeTokens({
      sessionId: "session-result-state-2",
      sessionJti: "66666666-6666-4666-8666-666666666666",
    });

    expect(
      resolveCheckoutResultState(
        {
          reviewToken: secondAttempt.reviewToken,
          sessionToken: secondAttempt.sessionToken,
          resultToken: pendingMarker(firstAttempt),
        },
        secret,
        { nowEpochSeconds: now + 2 },
      ),
    ).toMatchObject({ status: "awaiting_payment" });
  });

  it("does not let a stale terminal result override fresh transient state", () => {
    const tokens = activeTokens();
    const staleResult = issueTerminalCheckoutResult(
      order(),
      {
        provider: "mock",
        sessionId: "stale-session",
        status: "approved",
        orderReference: "FITORA-STALE",
      },
      secret,
      {
        nowEpochSeconds: now,
        jti: "77777777-7777-4777-8777-777777777777",
      },
    );

    expect(
      resolveCheckoutResultState(
        { ...tokens, resultToken: staleResult.token },
        secret,
        { nowEpochSeconds: now + 1 },
      ),
    ).toMatchObject({ status: "awaiting_payment" });
  });

  it("distinguishes ordinary missing state from tampering", () => {
    expect(resolveCheckoutResultState({}, secret)).toEqual({
      status: "expired",
    });
    expect(
      resolveCheckoutResultState({ resultToken: "tampered.value" }, secret),
    ).toEqual({ status: "reconciliation_required" });

    const tokens = activeTokens();
    expect(
      resolveCheckoutResultState(
        { resultToken: pendingMarker(tokens) },
        secret,
        { nowEpochSeconds: now + 1 },
      ),
    ).toEqual({ status: "reconciliation_required" });
  });

  it("rejects a session bound to another checkout", () => {
    const tokens = activeTokens();
    const otherOrder = order();
    const otherReview = issueCheckoutToken(otherOrder, secret, {
      nowEpochSeconds: now,
      jti: "44444444-4444-4444-8444-444444444444",
    });

    expect(
      resolveCheckoutResultState(
        { reviewToken: otherReview, sessionToken: tokens.sessionToken },
        secret,
        { nowEpochSeconds: now + 1 },
      ),
    ).toEqual({ status: "reconciliation_required" });
  });
});
