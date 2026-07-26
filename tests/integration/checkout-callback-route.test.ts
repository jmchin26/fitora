import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callbackMocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  resolveCheckout: vi.fn(),
}));

vi.mock("@/lib/checkout/prava-finalization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/checkout/prava-finalization")
  >();

  return {
    ...actual,
    finalizePravaCheckoutOnce: callbackMocks.finalize,
  };
});

vi.mock("@/lib/checkout/state", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/checkout/state")
  >();

  return {
    ...actual,
    resolveCheckoutState: callbackMocks.resolveCheckout,
  };
});

import { GET } from "@/app/checkout/callback/[attemptId]/route";
import {
  checkoutAttemptCookieName,
} from "@/lib/checkout/cookies";
import {
  issuePravaProgressToken,
  verifyPravaProgressToken,
} from "@/lib/checkout/prava-progress";
import { verifyPravaReconciliationToken } from "@/lib/checkout/prava-reconciliation";
import { verifyCheckoutOrder } from "@/lib/checkout/order";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
} from "@/lib/checkout/token";
import {
  checkoutResultFromClaims,
  issuePaymentSessionToken,
  verifyCheckoutResultToken,
  verifyPaymentSessionToken,
  verifyPendingCheckoutResultToken,
} from "@/lib/checkout/workflow";

const SIGNING_SECRET =
  "checkout-callback-route-signing-secret-123456789";
const PRAVA_TEST_SECRET = ["sk", "test", "callback-placeholder"].join(
  "_",
);
const SESSION_ID = "session_callback_test_001";
const REVIEW_ID = "a1000000-0000-4000-8000-00000000000a";
const ATTEMPT_ID = "90000000-0000-4000-8000-000000000009";

function checkoutState(
  options: {
    attemptId?: string;
    reviewId?: string;
    sessionId?: string;
  } = {},
) {
  const attemptId = options.attemptId ?? ATTEMPT_ID;
  const reviewId = options.reviewId ?? REVIEW_ID;
  const sessionId = options.sessionId ?? SESSION_ID;
  const verified = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!verified.ok) {
    throw new Error("Expected a canonical callback fixture.");
  }

  const nowEpochSeconds = Math.floor(Date.now() / 1_000);
  const review = issueCheckoutToken(verified.order, SIGNING_SECRET, {
    nowEpochSeconds,
    ttlSeconds: 15 * 60,
    jti: reviewId,
  });
  const reviewClaims = verifyCheckoutToken(review, SIGNING_SECRET, {
    nowEpochSeconds,
  });

  if (!reviewClaims.ok) {
    throw new Error("Expected valid callback review claims.");
  }

  const session = issuePaymentSessionToken(
    {
      attemptId,
      checkoutClaims: reviewClaims.claims,
      order: verified.order,
      session: {
        provider: "prava",
        sessionId,
        hostedUrl:
          "https://sandbox.collect.prava.space/?session_token=TEST_ONLY",
        expiresAt: new Date(
          (nowEpochSeconds + 10 * 60) * 1_000,
        ).toISOString(),
      },
    },
    SIGNING_SECRET,
    { nowEpochSeconds },
  );
  const sessionClaims = verifyPaymentSessionToken(
    session,
    SIGNING_SECRET,
    { nowEpochSeconds },
  );

  if (!sessionClaims.ok) {
    throw new Error("Expected valid callback session claims.");
  }

  return {
    order: verified.order,
    review,
    reviewClaims: reviewClaims.claims,
    session,
    sessionClaims: sessionClaims.claims,
  };
}

function callbackRequest(
  values: Partial<Record<"review" | "session" | "result", string>>,
  attemptId = ATTEMPT_ID,
): NextRequest {
  const cookie = Object.entries(values)
    .map(
      ([kind, value]) =>
        `${checkoutAttemptCookieName(
          kind as keyof typeof values,
          attemptId,
        )}=${value}`,
    )
    .join("; ");

  return new NextRequest(
    `https://fitora.example/checkout/callback/${attemptId}?status=approved&token=attacker-value`,
    {
      headers: cookie ? { Cookie: cookie } : {},
    },
  );
}

function runCallback(
  values: Partial<Record<"review" | "session" | "result", string>>,
  attemptId = ATTEMPT_ID,
) {
  return GET(callbackRequest(values, attemptId), {
    params: Promise.resolve({ attemptId }),
  });
}

beforeEach(async () => {
  const actualState = await vi.importActual<
    typeof import("@/lib/checkout/state")
  >("@/lib/checkout/state");

  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYMENT_PROVIDER", "prava");
  vi.stubEnv("CHECKOUT_SIGNING_SECRET", SIGNING_SECRET);
  vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
  vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
  callbackMocks.finalize.mockReset();
  callbackMocks.resolveCheckout.mockReset();
  callbackMocks.resolveCheckout.mockImplementation(
    actualState.resolveCheckoutState,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /checkout/callback", () => {
  it("ignores callback query data and stores only a sanitized approved result", async () => {
    const state = checkoutState();
    callbackMocks.finalize.mockResolvedValue({
      status: "terminal",
      paymentResult: {
        provider: "prava",
        sessionId: SESSION_ID,
        status: "approved",
        orderReference: "FITORA-PRAVA-CALLBACK01",
      },
    });

    const response = await runCallback({
      review: state.review,
      session: state.session,
    });
    const resultCookie = response.cookies.get(
      checkoutAttemptCookieName("result", ATTEMPT_ID),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      `https://fitora.example/checkout/result?attempt=${ATTEMPT_ID}`,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(resultCookie?.value).toBeTruthy();
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("review", ATTEMPT_ID),
      ),
    ).toMatchObject({ value: "" });
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("session", ATTEMPT_ID),
      ),
    ).toMatchObject({ value: "" });

    if (!resultCookie) {
      throw new Error("Expected a callback result cookie.");
    }

    const verified = verifyCheckoutResultToken(
      resultCookie.value,
      SIGNING_SECRET,
    );

    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(checkoutResultFromClaims(verified.claims)).toMatchObject({
        provider: "prava",
        status: "approved",
        orderReference: "FITORA-PRAVA-CALLBACK01",
      });
    }
    expect(JSON.stringify(verified)).not.toMatch(
      /attacker-value|session_callback_test_001|token/i,
    );
  });

  it("stores a bound pending marker only for provider-confirmed pending", async () => {
    const state = checkoutState();
    callbackMocks.finalize.mockResolvedValue({
      status: "pending",
      providerConfirmed: true,
    });

    const response = await runCallback({
      review: state.review,
      session: state.session,
    });
    const resultCookie = response.cookies.get(
      checkoutAttemptCookieName("result", ATTEMPT_ID),
    );

    expect(resultCookie?.value).toBeTruthy();
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("review", ATTEMPT_ID),
      ),
    ).toBeUndefined();
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("session", ATTEMPT_ID),
      ),
    ).toBeUndefined();
    expect(
      resultCookie &&
        verifyPendingCheckoutResultToken(
          resultCookie.value,
          SIGNING_SECRET,
        ),
    ).toMatchObject({
      ok: true,
      claims: { provider: "prava", status: "pending" },
    });
  });

  it("stores reconciliation state when provider polling is uncertain", async () => {
    const state = checkoutState();
    callbackMocks.finalize.mockResolvedValue({
      status: "pending",
      providerConfirmed: false,
    });

    const response = await runCallback({
      review: state.review,
      session: state.session,
    });
    const resultCookie = response.cookies.get(
      checkoutAttemptCookieName("result", ATTEMPT_ID),
    );

    expect(
      resultCookie &&
        verifyPravaReconciliationToken(
          resultCookie.value,
          SIGNING_SECRET,
        ),
    ).toMatchObject({
      ok: true,
      claims: { stage: "reconciliation_required" },
    });
  });

  it("retries a bound merchant-report marker without exposing its transaction reference", async () => {
    const state = checkoutState();
    const progressToken = issuePravaProgressToken(
      {
        checkoutClaims: state.reviewClaims,
        sessionClaims: state.sessionClaims,
        order: state.order,
        transactionReference: "line_sensitive_reference_001",
        expectedOutcome: {
          status: "approved",
          orderReference: "FITORA-PRAVA-CALLBACK01",
        },
      },
      SIGNING_SECRET,
    );
    callbackMocks.finalize.mockResolvedValue({
      status: "reconciliation_required",
      progress: {
        transactionReference: "line_sensitive_reference_001",
        expectedOutcome: {
          status: "approved",
          orderReference: "FITORA-PRAVA-CALLBACK01",
        },
      },
    });

    const response = await runCallback({
      review: state.review,
      session: state.session,
      result: progressToken,
    });
    const resultCookie = response.cookies.get(
      checkoutAttemptCookieName("result", ATTEMPT_ID),
    );

    expect(callbackMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        existingProgress: expect.objectContaining({
          stage: "merchant_report_attempted",
        }),
      }),
    );
    expect(
      resultCookie &&
        verifyPravaProgressToken(resultCookie.value, SIGNING_SECRET),
    ).toMatchObject({ ok: true });
    expect(resultCookie?.value).not.toContain(
      "line_sensitive_reference_001",
    );
  });

  it("still queries Prava but forbids merchant execution when the catalogue drifted", async () => {
    const state = checkoutState();
    callbackMocks.resolveCheckout.mockReturnValue({
      ok: false,
      reason: "ORDER_CHANGED",
    });
    callbackMocks.finalize.mockResolvedValue({
      status: "terminal",
      paymentResult: {
        provider: "prava",
        sessionId: SESSION_ID,
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      },
    });

    const response = await runCallback({
      review: state.review,
      session: state.session,
    });

    expect(response.status).toBe(303);
    expect(callbackMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantExecutionAllowed: false,
        order: state.order,
        sessionId: SESSION_ID,
      }),
    );
  });

  it("finalizes only the path-selected attempt when two tabs have scoped state", async () => {
    const stateA = checkoutState();
    const attemptB = "b0000000-0000-4000-8000-00000000000b";
    const sessionB = "session_callback_test_002";
    const stateB = checkoutState({
      attemptId: attemptB,
      sessionId: sessionB,
    });
    callbackMocks.finalize.mockResolvedValue({
      status: "terminal",
      paymentResult: {
        provider: "prava",
        sessionId: SESSION_ID,
        status: "approved",
        orderReference: "FITORA-PRAVA-ISOLATED01",
      },
    });
    const cookie = [
      `${checkoutAttemptCookieName("review", ATTEMPT_ID)}=${stateA.review}`,
      `${checkoutAttemptCookieName("session", ATTEMPT_ID)}=${stateA.session}`,
      `${checkoutAttemptCookieName("review", attemptB)}=${stateB.review}`,
      `${checkoutAttemptCookieName("session", attemptB)}=${stateB.session}`,
    ].join("; ");
    const request = new NextRequest(
      `https://fitora.example/checkout/callback/${ATTEMPT_ID}`,
      { headers: { Cookie: cookie } },
    );

    const response = await GET(request, {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(callbackMocks.finalize).toHaveBeenCalledOnce();
    expect(callbackMocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    );
    expect(setCookie).not.toContain(
      checkoutAttemptCookieName("review", attemptB),
    );
    expect(setCookie).not.toContain(
      checkoutAttemptCookieName("session", attemptB),
    );
    expect(setCookie).not.toContain(sessionB);
  });

  it("does not call Prava without both valid transient cookies", async () => {
    const response = await runCallback({});

    expect(response.status).toBe(303);
    expect(callbackMocks.finalize).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("rejects an invalid attempt locator without reading state or calling Prava", async () => {
    const response = await GET(
      new NextRequest(
        "https://fitora.example/checkout/callback/not-a-valid-attempt",
      ),
      {
        params: Promise.resolve({ attemptId: "not-a-valid-attempt" }),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://fitora.example/checkout/result",
    );
    expect(callbackMocks.finalize).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
