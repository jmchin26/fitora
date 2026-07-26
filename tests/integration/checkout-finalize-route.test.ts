import { NextRequest } from "next/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const paymentFactoryMocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/payments/factory", () => ({
  resolvePaymentProvider: paymentFactoryMocks.resolve,
}));

import { POST } from "@/app/api/checkout/finalize/route";
import {
  CheckoutApiErrorSchema,
  CheckoutFinalizedSchema,
} from "@/lib/checkout/api-contracts";
import { CHECKOUT_COOKIE_NAMES } from "@/lib/checkout/cookies";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  checkoutResultFromClaims,
  issuePaymentSessionToken,
  issueTerminalCheckoutResult,
  verifyCheckoutResultToken,
  verifyPendingCheckoutResultToken,
} from "@/lib/checkout/workflow";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
  type CheckoutTokenClaims,
} from "@/lib/checkout/token";
import type {
  HostedSession,
  PaymentResult,
} from "@/lib/payments/types";

const TEST_SIGNING_SECRET =
  "fitora-checkout-finalize-route-test-signing-secret";
const PRAVA_TEST_SECRET = ["sk", "test", "finalize-placeholder"].join(
  "_",
);
const CHECKOUT_JTI = "11111111-1111-4111-8111-111111111111";
const SESSION_JTI = "22222222-2222-4222-8222-222222222222";
const RESULT_JTI = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "mock-session-123";
const validOrderInput = {
  outfit: {
    top: { productId: "top-01", selectedSize: "M" },
    bottom: { productId: "bottom-01", selectedSize: "M" },
    shoes: { productId: "shoes-01", selectedSize: "42" },
  },
} as const;

type CheckoutStateCookies = {
  review: string;
  session: string;
};

function verifiedOrder(): VerifiedOrder {
  const result = verifyCheckoutOrder(validOrderInput);

  if (!result.ok) {
    throw new Error("The checkout finalize route fixture is invalid.");
  }

  return result.order;
}

function issueReviewClaims(
  nowEpochSeconds: number,
  jti = CHECKOUT_JTI,
  ttlSeconds = 15 * 60,
): { token: string; claims: CheckoutTokenClaims } {
  const token = issueCheckoutToken(
    verifiedOrder(),
    TEST_SIGNING_SECRET,
    { nowEpochSeconds, jti, ttlSeconds },
  );
  const verified = verifyCheckoutToken(token, TEST_SIGNING_SECRET, {
    nowEpochSeconds,
  });

  if (!verified.ok) {
    throw new Error("The checkout review fixture token is invalid.");
  }

  return { token, claims: verified.claims };
}

function hostedSession(
  nowEpochSeconds: number,
  provider: "mock" | "prava" = "mock",
): HostedSession {
  return {
    provider,
    sessionId: SESSION_ID,
    hostedUrl:
      provider === "mock"
        ? `http://localhost:3000/checkout/mock?sessionId=${SESSION_ID}`
        : "https://sandbox.example/hosted/session",
    expiresAt: new Date((nowEpochSeconds + 10 * 60) * 1_000).toISOString(),
  };
}

function checkoutStateCookies(
  options: {
    nowEpochSeconds?: number;
    sessionCheckoutJti?: string;
    sessionProvider?: "mock" | "prava";
  } = {},
): CheckoutStateCookies {
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const review = issueReviewClaims(nowEpochSeconds);
  const sessionCheckout =
    options.sessionCheckoutJti &&
    options.sessionCheckoutJti !== CHECKOUT_JTI
      ? issueReviewClaims(
          nowEpochSeconds,
          options.sessionCheckoutJti,
        ).claims
      : review.claims;
  const session = issuePaymentSessionToken(
    {
      attemptId: SESSION_JTI,
      checkoutClaims: sessionCheckout,
      order: verifiedOrder(),
      session: hostedSession(
        nowEpochSeconds,
        options.sessionProvider,
      ),
    },
    TEST_SIGNING_SECRET,
    {
      nowEpochSeconds,
      jti: SESSION_JTI,
    },
  );

  return { review: review.token, session };
}

function cookieHeader(
  values: Partial<Record<"review" | "session" | "result", string>>,
): string {
  return Object.entries(values)
    .map(
      ([kind, value]) =>
        `${CHECKOUT_COOKIE_NAMES[kind as keyof typeof values]}=${value}`,
    )
    .join("; ");
}

function jsonRequest(
  body: unknown,
  cookies: Partial<
    Record<"review" | "session" | "result", string>
  > = {},
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/checkout/finalize",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Object.keys(cookies).length > 0
          ? { Cookie: cookieHeader(cookies) }
          : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

function malformedJsonRequest(): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/checkout/finalize",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"decision":',
    },
  );
}

function approvedResult(): PaymentResult {
  return {
    provider: "mock",
    sessionId: SESSION_ID,
    status: "approved",
    orderReference: "FITORA-ROUTE123",
  };
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYMENT_PROVIDER", "mock");
  vi.stubEnv("CHECKOUT_SIGNING_SECRET", TEST_SIGNING_SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("PRAVA_SECRET_KEY", "");

  paymentFactoryMocks.finalize.mockReset();
  paymentFactoryMocks.resolve.mockReset();
  paymentFactoryMocks.finalize.mockResolvedValue(approvedResult());
  paymentFactoryMocks.resolve.mockReturnValue({
    status: "ready",
    configured: "mock",
    provider: {
      name: "mock",
      createSession: vi.fn(),
      finalize: paymentFactoryMocks.finalize,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/checkout/finalize", () => {
  it("rejects browser-controlled finalization in real Prava mode", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");

    const response = await POST(
      jsonRequest({ decision: "approve" }, checkoutStateCookies()),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(409);
    expect(CheckoutApiErrorSchema.safeParse(body)).toMatchObject({
      success: true,
      data: {
        error: { code: "PAYMENT_FINALIZE_NOT_ALLOWED" },
      },
    });
    expect(paymentFactoryMocks.resolve).not.toHaveBeenCalled();
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("rejects text/plain and sibling-origin requests before finalizing or setting cookies", async () => {
    const textPlain = await POST(
      jsonRequest(
        { decision: "approve" },
        checkoutStateCookies(),
        {
          "Content-Type": "text/plain",
          Origin: "http://localhost:3000",
        },
      ),
    );
    const sibling = await POST(
      jsonRequest(
        { decision: "approve" },
        checkoutStateCookies(),
        { Origin: "http://shop.localhost:3000" },
      ),
    );
    const textBody: unknown = await textPlain.json();
    const siblingBody: unknown = await sibling.json();

    expect(textPlain.status).toBe(415);
    expect(sibling.status).toBe(403);
    expect(CheckoutApiErrorSchema.safeParse(textBody)).toMatchObject({
      success: true,
      data: { error: { code: "INVALID_CONTENT_TYPE" } },
    });
    expect(CheckoutApiErrorSchema.safeParse(siblingBody)).toMatchObject({
      success: true,
      data: { error: { code: "INVALID_REQUEST_ORIGIN" } },
    });
    expect(textPlain.headers.get("Set-Cookie")).toBeNull();
    expect(sibling.headers.get("Set-Cookie")).toBeNull();
    expect(paymentFactoryMocks.resolve).not.toHaveBeenCalled();
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
    expectNoStore(textPlain);
    expectNoStore(sibling);
  });

  it("finalizes an approved payment, stores only a sanitized result, and clears transient state", async () => {
    const cookies = checkoutStateCookies();
    const response = await POST(
      jsonRequest({ decision: "approve" }, cookies),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutFinalizedSchema.safeParse(body);
    const resultCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.result,
    );

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.status).toBe("approved");
    expectNoStore(response);
    expect(paymentFactoryMocks.finalize).toHaveBeenCalledOnce();
    expect(paymentFactoryMocks.finalize).toHaveBeenCalledWith(
      {
        order: verifiedOrder(),
        sessionId: SESSION_ID,
        decision: "approve",
      },
      expect.any(AbortSignal),
    );
    expect(resultCookie?.value).toBeTruthy();
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.review),
    ).toMatchObject({ value: "" });
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.session),
    ).toMatchObject({ value: "" });

    if (!resultCookie) {
      throw new Error("The approved result cookie was not created.");
    }

    const verifiedResult = verifyCheckoutResultToken(
      resultCookie.value,
      TEST_SIGNING_SECRET,
    );

    expect(verifiedResult.ok).toBe(true);

    if (!verifiedResult.ok) {
      throw new Error("The approved result cookie is invalid.");
    }

    const safeResult = checkoutResultFromClaims(
      verifiedResult.claims,
    );
    const serializedPublicState = JSON.stringify({ body, safeResult });

    expect(safeResult).toMatchObject({
      provider: "mock",
      status: "approved",
      orderReference: "FITORA-ROUTE123",
      currency: "USD",
      totalCents: verifiedOrder().totalCents,
      itemCount: 3,
    });
    expect(serializedPublicState).not.toMatch(
      /sessionId|mock-session-123|email|authorization|secret|token/i,
    );

    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("stores a strict declined result without an order reference", async () => {
    paymentFactoryMocks.finalize.mockResolvedValue({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "declined",
      reasonCode: "CUSTOMER_DECLINED",
    });

    const response = await POST(
      jsonRequest({ decision: "decline" }, checkoutStateCookies()),
    );
    const body: unknown = await response.json();
    const resultCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.result,
    );

    expect(CheckoutFinalizedSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { status: "declined" },
    });
    expect(resultCookie?.value).toBeTruthy();

    if (!resultCookie) {
      throw new Error("The declined result cookie was not created.");
    }

    const verifiedResult = verifyCheckoutResultToken(
      resultCookie.value,
      TEST_SIGNING_SECRET,
    );

    if (!verifiedResult.ok) {
      throw new Error("The declined result cookie is invalid.");
    }

    expect(checkoutResultFromClaims(verifiedResult.claims)).toEqual(
      expect.objectContaining({
        status: "declined",
        reasonCode: "CUSTOMER_DECLINED",
      }),
    );
    expect(JSON.stringify(verifiedResult.claims)).not.toContain(
      "orderReference",
    );
  });

  it("returns an existing terminal result without resolving or calling a provider", async () => {
    const issued = issueTerminalCheckoutResult(
      verifiedOrder(),
      approvedResult(),
      TEST_SIGNING_SECRET,
      {
        jti: RESULT_JTI,
      },
    );

    const response = await POST(
      jsonRequest(
        { decision: "decline" },
        { result: issued.token },
      ),
    );
    const body: unknown = await response.json();

    expect(CheckoutFinalizedSchema.safeParse(body)).toMatchObject({
      success: true,
      data: {
        status: "approved",
        redirectUrl: "/checkout/result",
      },
    });
    expect(paymentFactoryMocks.resolve).not.toHaveBeenCalled();
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
    expectNoStore(response);
  });

  it("does not use the terminal-result shortcut while either transient cookie remains", async () => {
    const issued = issueTerminalCheckoutResult(
      verifiedOrder(),
      approvedResult(),
      TEST_SIGNING_SECRET,
      { jti: RESULT_JTI },
    );
    const transient = checkoutStateCookies();
    const reviewOnly = await POST(
      jsonRequest(
        { decision: "approve" },
        { result: issued.token, review: transient.review },
      ),
    );
    const sessionOnly = await POST(
      jsonRequest(
        { decision: "approve" },
        { result: issued.token, session: transient.session },
      ),
    );
    const reviewOnlyBody: unknown = await reviewOnly.json();
    const sessionOnlyBody: unknown = await sessionOnly.json();

    expect(CheckoutApiErrorSchema.safeParse(reviewOnlyBody)).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_MISSING" } },
    });
    expect(CheckoutApiErrorSchema.safeParse(sessionOnlyBody)).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_MISSING" } },
    });
    expect(reviewOnly.headers.get("Set-Cookie")).toBeNull();
    expect(sessionOnly.headers.get("Set-Cookie")).toBeNull();
    expect(paymentFactoryMocks.resolve).not.toHaveBeenCalled();
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
  });

  it("does not let a stale terminal result short-circuit fresh transient state", async () => {
    const stale = issueTerminalCheckoutResult(
      verifiedOrder(),
      approvedResult(),
      TEST_SIGNING_SECRET,
      { jti: RESULT_JTI },
    );
    paymentFactoryMocks.finalize.mockResolvedValue({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "declined",
      reasonCode: "CUSTOMER_DECLINED",
    });

    const response = await POST(
      jsonRequest(
        { decision: "decline" },
        { ...checkoutStateCookies(), result: stale.token },
      ),
    );
    const body: unknown = await response.json();
    const resultCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.result,
    );

    expect(CheckoutFinalizedSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { status: "declined" },
    });
    expect(paymentFactoryMocks.resolve).toHaveBeenCalledOnce();
    expect(paymentFactoryMocks.finalize).toHaveBeenCalledOnce();
    expect(resultCookie?.value).toBeTruthy();

    if (!resultCookie) {
      throw new Error("The fresh terminal result was not stored.");
    }

    const verified = verifyCheckoutResultToken(
      resultCookie.value,
      TEST_SIGNING_SECRET,
    );

    expect(verified).toMatchObject({
      ok: true,
      claims: {
        status: "declined",
        reasonCode: "CUSTOMER_DECLINED",
      },
    });
  });

  it("stores a sanitized pending marker while retaining review and session state", async () => {
    paymentFactoryMocks.finalize.mockResolvedValue({
      provider: "mock",
      sessionId: SESSION_ID,
      status: "pending",
      retryable: true,
    });

    const response = await POST(
      jsonRequest({ decision: "approve" }, checkoutStateCookies()),
    );
    const body: unknown = await response.json();
    const resultCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.result,
    );

    expect(CheckoutFinalizedSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { status: "pending" },
    });
    expect(resultCookie?.value).toBeTruthy();
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.review),
    ).toBeUndefined();
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.session),
    ).toBeUndefined();
    expect(paymentFactoryMocks.finalize).toHaveBeenCalledOnce();
    expectNoStore(response);

    if (!resultCookie) {
      throw new Error("The pending marker cookie was not created.");
    }

    const verifiedMarker = verifyPendingCheckoutResultToken(
      resultCookie.value,
      TEST_SIGNING_SECRET,
    );

    expect(verifiedMarker).toMatchObject({
      ok: true,
      claims: {
        status: "pending",
        provider: "mock",
        checkoutJti: CHECKOUT_JTI,
        paymentAttemptJti: SESSION_JTI,
      },
    });
    expect(
      verifyCheckoutResultToken(
        resultCookie.value,
        TEST_SIGNING_SECRET,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      Buffer.from(
        resultCookie.value.split(".")[0],
        "base64url",
      ).toString("utf8"),
    ).not.toMatch(
      /session|mock-session-123|email|hostedUrl|authorization|secret|token/i,
    );
  });

  it("rejects malformed JSON and any fields outside the public decision contract", async () => {
    const malformedResponse = await POST(malformedJsonRequest());
    const extraFieldResponse = await POST(
      jsonRequest(
        {
          decision: "approve",
          sessionId: "client-controlled",
        },
        checkoutStateCookies(),
      ),
    );
    const malformedBody: unknown = await malformedResponse.json();
    const extraFieldBody: unknown = await extraFieldResponse.json();

    expect(CheckoutApiErrorSchema.safeParse(malformedBody)).toMatchObject({
      success: true,
      data: { error: { code: "INVALID_JSON" } },
    });
    expect(CheckoutApiErrorSchema.safeParse(extraFieldBody)).toMatchObject({
      success: true,
      data: { error: { code: "INVALID_CHECKOUT_REQUEST" } },
    });
    expect(JSON.stringify(extraFieldBody)).not.toContain(
      "client-controlled",
    );
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
    expectNoStore(malformedResponse);
    expectNoStore(extraFieldResponse);
  });

  it("requires both reviewed checkout and payment-session cookies", async () => {
    const noReview = await POST(
      jsonRequest({ decision: "approve" }),
    );
    const review = issueReviewClaims(
      Math.floor(Date.now() / 1_000),
    );
    const noSession = await POST(
      jsonRequest(
        { decision: "approve" },
        { review: review.token },
      ),
    );
    const noReviewBody: unknown = await noReview.json();
    const noSessionBody: unknown = await noSession.json();

    expect(CheckoutApiErrorSchema.safeParse(noReviewBody)).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_MISSING" } },
    });
    expect(CheckoutApiErrorSchema.safeParse(noSessionBody)).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_MISSING" } },
    });
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
  });

  it("rejects a session bound to another checkout or provider", async () => {
    const otherCheckout = await POST(
      jsonRequest(
        { decision: "approve" },
        checkoutStateCookies({
          sessionCheckoutJti:
            "44444444-4444-4444-8444-444444444444",
        }),
      ),
    );
    const otherProvider = await POST(
      jsonRequest(
        { decision: "approve" },
        checkoutStateCookies({ sessionProvider: "prava" }),
      ),
    );
    const otherCheckoutBody: unknown = await otherCheckout.json();
    const otherProviderBody: unknown = await otherProvider.json();

    expect(
      CheckoutApiErrorSchema.safeParse(otherCheckoutBody),
    ).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_INVALID" } },
    });
    expect(
      CheckoutApiErrorSchema.safeParse(otherProviderBody),
    ).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_INVALID" } },
    });
    expect(paymentFactoryMocks.resolve).not.toHaveBeenCalled();
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
  });

  it("rejects an expired payment session with a sanitized response", async () => {
    const current = Math.floor(Date.now() / 1_000);
    const issuedAt = current - 10 * 60;
    const review = issueReviewClaims(issuedAt, CHECKOUT_JTI, 15 * 60);
    const session = issuePaymentSessionToken(
      {
        attemptId: SESSION_JTI,
        checkoutClaims: review.claims,
        order: verifiedOrder(),
        session: {
          ...hostedSession(issuedAt),
          expiresAt: new Date((issuedAt + 5 * 60) * 1_000).toISOString(),
        },
      },
      TEST_SIGNING_SECRET,
      {
        nowEpochSeconds: issuedAt,
        jti: SESSION_JTI,
      },
    );

    const response = await POST(
      jsonRequest(
        { decision: "approve" },
        { review: review.token, session },
      ),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(410);
    expect(CheckoutApiErrorSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { error: { code: "CHECKOUT_STATE_EXPIRED" } },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /sessionId|mock-session-123|token|secret/i,
    );
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
  });

  it("rejects provider output for another session and does not create result state", async () => {
    paymentFactoryMocks.finalize.mockResolvedValue({
      ...approvedResult(),
      sessionId: "another-session",
    });

    const response = await POST(
      jsonRequest({ decision: "approve" }, checkoutStateCookies()),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(502);
    expect(CheckoutApiErrorSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { error: { code: "PAYMENT_FINALIZE_FAILED" } },
    });
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.result),
    ).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("another-session");
  });

  it("reports an unavailable configured provider without falling back", async () => {
    paymentFactoryMocks.resolve.mockReturnValue({
      status: "unavailable",
      configured: "mock",
      reason: "NOT_IMPLEMENTED",
      message: "Unavailable in test.",
    });

    const response = await POST(
      jsonRequest({ decision: "approve" }, checkoutStateCookies()),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(503);
    expect(CheckoutApiErrorSchema.safeParse(body)).toMatchObject({
      success: true,
      data: { error: { code: "PAYMENT_PROVIDER_UNAVAILABLE" } },
    });
    expect(paymentFactoryMocks.finalize).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("Unavailable in test.");
  });
});
