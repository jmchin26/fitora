import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/checkout/create-session/route";
import {
  CheckoutApiErrorSchema,
  CheckoutSessionStartedSchema,
} from "@/lib/checkout/api-contracts";
import {
  CHECKOUT_BROWSER_ID_COOKIE_NAME,
  CHECKOUT_COOKIE_NAMES,
  checkoutAttemptCookieName,
} from "@/lib/checkout/cookies";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
} from "@/lib/checkout/token";
import {
  issuePaymentSessionToken,
  issueTerminalCheckoutResult,
  verifyPaymentSessionTokenForCheckout,
} from "@/lib/checkout/workflow";

const TEST_SIGNING_SECRET =
  "fitora-create-session-route-test-signing-secret";
const PRAVA_TEST_SECRET = ["sk", "test", "route-placeholder"].join("_");
const TEST_BROWSER_ID =
  "f0000000-0000-4000-8000-00000000000f";

const validOutfit = {
  top: {
    productId: "top-01",
    selectedSize: "M",
  },
  bottom: {
    productId: "bottom-01",
    selectedSize: "M",
  },
  shoes: {
    productId: "shoes-01",
    selectedSize: "42",
  },
} as const;

function orderFixture(): VerifiedOrder {
  const verified = verifyCheckoutOrder({ outfit: validOutfit });

  if (!verified.ok) {
    throw new Error("The create-session route fixture is invalid.");
  }

  return verified.order;
}

function reviewToken(
  options: {
    nowEpochSeconds?: number;
    ttlSeconds?: number;
  } = {},
): string {
  return issueCheckoutToken(
    orderFixture(),
    TEST_SIGNING_SECRET,
    options,
  );
}

function reviewIdFromToken(token: string): string {
  const payload = token.split(".")[0];

  if (!payload) {
    throw new Error("Expected a signed review-token fixture.");
  }

  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as { jti?: unknown };

  if (typeof decoded.jti !== "string") {
    throw new Error("Expected a review JTI fixture.");
  }

  return decoded.jti;
}

function approval(
  token: string,
  email = "shopper@example.com",
  attemptId = reviewIdFromToken(token),
): { attemptId: string; email: string; reviewId: string } {
  return {
    attemptId,
    email,
    reviewId: reviewIdFromToken(token),
  };
}

function request(
  body: unknown,
  token?: string,
  origin = "http://localhost:3000",
  originHeader?: string,
  contentType: string | null = "application/json",
  sessionToken?: string,
  attemptId?: string,
  extraCookies: readonly string[] = [],
  browserId: string | null = token
    ? reviewIdFromToken(token)
    : TEST_BROWSER_ID,
): NextRequest {
  return new NextRequest(`${origin}/api/checkout/create-session`, {
    method: "POST",
    headers: {
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(originHeader ? { Origin: originHeader } : {}),
      ...(token || sessionToken || extraCookies.length > 0 || browserId
        ? {
            Cookie: [
              browserId
                ? `${CHECKOUT_BROWSER_ID_COOKIE_NAME}=${browserId}`
                : undefined,
              token
                ? `${CHECKOUT_COOKIE_NAMES.review}=${token}`
                : undefined,
              sessionToken
                ? `${
                    attemptId
                      ? checkoutAttemptCookieName("session", attemptId)
                      : CHECKOUT_COOKIE_NAMES.session
                  }=${sessionToken}`
                : undefined,
              ...extraCookies,
            ]
              .filter(Boolean)
              .join("; "),
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function activePravaAttemptCookies(
  attemptId: string,
  options: {
    nowEpochSeconds?: number;
    ttlSeconds?: number;
  } = {},
): readonly string[] {
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds = options.ttlSeconds ?? 10 * 60;
  const order = orderFixture();
  const review = issueCheckoutToken(
    order,
    TEST_SIGNING_SECRET,
    {
      nowEpochSeconds,
      ttlSeconds,
      jti: attemptId,
    },
  );
  const checkout = verifyCheckoutToken(
    review,
    TEST_SIGNING_SECRET,
    { nowEpochSeconds },
  );

  if (!checkout.ok) {
    throw new Error("Expected a valid active-attempt review fixture.");
  }

  const session = issuePaymentSessionToken(
    {
      attemptId,
      checkoutClaims: checkout.claims,
      order,
      session: {
        provider: "prava",
        sessionId: `session_budget_${attemptId.slice(0, 8)}`,
        hostedUrl:
          "https://sandbox.collect.prava.space/checkout?session_token=TEST_ONLY",
        expiresAt: new Date(
          (nowEpochSeconds + ttlSeconds) * 1_000,
        ).toISOString(),
      },
    },
    TEST_SIGNING_SECRET,
    { nowEpochSeconds, ttlSeconds },
  );

  return [
    `${checkoutAttemptCookieName("review", attemptId)}=${review}`,
    `${checkoutAttemptCookieName("session", attemptId)}=${session}`,
  ];
}

function malformedJsonRequest(): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/checkout/create-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: '{"email":',
    },
  );
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/checkout/create-session", () => {
  it("creates a bound mock session only after approval without returning email or a session id", async () => {
    const token = reviewToken();
    const response = await POST(
      request(approval(token, " shopper@example.com "), token),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutSessionStartedSchema.safeParse(body);
    const sessionCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.session,
    );
    const refreshedReviewCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.review,
    );
    const checkoutClaims = verifyCheckoutToken(
      refreshedReviewCookie?.value,
      TEST_SIGNING_SECRET,
    );

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(body).toMatchObject({
      ok: true,
      provider: "mock",
      hostedUrl: "/checkout/mock",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /shopper@example\.com|sessionId|\?session/i,
    );
    expect(sessionCookie?.value).toBeTruthy();
    expect(refreshedReviewCookie?.value).toBeTruthy();
    expect(refreshedReviewCookie?.value).not.toBe(token);
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.result),
    ).toMatchObject({ value: "" });

    if (!checkoutClaims.ok || !sessionCookie) {
      throw new Error("The signed checkout fixtures must be valid.");
    }

    expect(
      verifyPaymentSessionTokenForCheckout(
        sessionCookie.value,
        checkoutClaims.claims,
        TEST_SIGNING_SECRET,
      ),
    ).toMatchObject({
      ok: true,
      claims: {
        checkoutJti: checkoutClaims.claims.jti,
        provider: "mock",
      },
    });

    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.session}=`);
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.review}=`);
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.result}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=1200");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("sets Secure on session and cleared-result cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");

    const token = reviewToken();
    const response = await POST(
      request(
        approval(token),
        token,
        "https://fitora.example",
        "https://fitora.example",
      ),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("Secure");
    expect(setCookie.match(/Secure/g)).toHaveLength(3);
    expectNoStore(response);
  });

  it("rejects text/plain and sibling-origin approval requests before creating a session", async () => {
    const token = reviewToken();
    const textPlain = await POST(
      request(
        approval(token),
        token,
        "http://localhost:3000",
        "http://localhost:3000",
        "text/plain",
      ),
    );
    const sibling = await POST(
      request(
        approval(token),
        token,
        "http://localhost:3000",
        "http://shop.localhost:3000",
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
    expectNoStore(textPlain);
    expectNoStore(sibling);
  });

  it("rejects malformed JSON and strict-contract violations before creating state", async () => {
    const malformed = await POST(malformedJsonRequest());
    const malformedBody: unknown = await malformed.json();
    const malformedError =
      CheckoutApiErrorSchema.safeParse(malformedBody);
    const token = reviewToken();
    const extraField = await POST(
      request(
        {
          ...approval(token),
          clientTotalCents: 1,
        },
        token,
      ),
    );
    const extraBody: unknown = await extraField.json();
    const extraError = CheckoutApiErrorSchema.safeParse(extraBody);

    expect(malformed.status).toBe(400);
    expect(malformedError.success).toBe(true);
    expectNoStore(malformed);
    expect(malformed.headers.get("Set-Cookie")).toBeNull();
    expect(extraField.status).toBe(400);
    expect(extraError.success).toBe(true);
    expectNoStore(extraField);
    expect(extraField.headers.get("Set-Cookie")).toBeNull();

    if (malformedError.success && extraError.success) {
      expect(malformedError.data.error.code).toBe("INVALID_JSON");
      expect(extraError.data.error.code).toBe(
        "INVALID_CHECKOUT_REQUEST",
      );
      expect(JSON.stringify(extraError.data)).not.toContain(
        "clientTotalCents",
      );
    }
  });

  it("rejects non-canonical attempt locators before any Prava side effect", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();
    const upperCase = await POST(
      request(
        approval(
          token,
          "shopper@example.com",
          "D0000000-0000-4000-8000-00000000000D",
        ),
        token,
        "https://fitora.example",
        "https://fitora.example",
      ),
    );
    const nil = await POST(
      request(
        approval(
          token,
          "shopper@example.com",
          "00000000-0000-0000-0000-000000000000",
        ),
        token,
        "https://fitora.example",
        "https://fitora.example",
      ),
    );

    expect(upperCase.status).toBe(400);
    expect(nil.status).toBe(400);
    expect(await upperCase.json()).toMatchObject({
      error: { code: "INVALID_CHECKOUT_REQUEST" },
    });
    expect(await nil.json()).toMatchObject({
      error: { code: "INVALID_CHECKOUT_REQUEST" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upperCase.headers.get("Set-Cookie")).toBeNull();
    expect(nil.headers.get("Set-Cookie")).toBeNull();
  });

  it("requires the stable browser scope issued with a Prava review", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();
    const response = await POST(
      request(
        approval(token),
        token,
        "https://fitora.example",
        "https://fitora.example",
        "application/json",
        undefined,
        undefined,
        [],
        null,
      ),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "CHECKOUT_STATE_INVALID" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires reviewed checkout state", async () => {
    const response = await POST(
      request({
        attemptId: "e0000000-0000-4000-8000-00000000000e",
        email: "shopper@example.com",
        reviewId: "60000000-0000-4000-8000-000000000006",
      }),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(401);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(response.headers.get("Set-Cookie")).toBeNull();

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("CHECKOUT_STATE_MISSING");
    }
  });

  it("rejects approval from a stale review tab before creating any provider session", async () => {
    const displayedReview = reviewToken();
    const currentReview = reviewToken();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      request(approval(displayedReview), currentReview),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: { code: "CHECKOUT_STATE_INVALID" },
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoStore(response);
  });

  it("rejects expired and tampered reviewed state with sanitized errors", async () => {
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const expired = reviewToken({
      nowEpochSeconds: nowEpochSeconds - 120,
      ttlSeconds: 60,
    });
    const valid = reviewToken();
    const lastCharacter = valid.at(-1);
    const tampered = `${valid.slice(0, -1)}${
      lastCharacter === "A" ? "B" : "A"
    }`;
    const expiredResponse = await POST(
      request(approval(expired), expired),
    );
    const expiredBody: unknown = await expiredResponse.json();
    const expiredError =
      CheckoutApiErrorSchema.safeParse(expiredBody);
    const tamperedResponse = await POST(
      request(approval(tampered), tampered),
    );
    const tamperedBody: unknown = await tamperedResponse.json();
    const tamperedError =
      CheckoutApiErrorSchema.safeParse(tamperedBody);

    expect(expiredResponse.status).toBe(410);
    expect(tamperedResponse.status).toBe(401);
    expect(expiredError.success).toBe(true);
    expect(tamperedError.success).toBe(true);
    expectNoStore(expiredResponse);
    expectNoStore(tamperedResponse);
    expect(expiredResponse.headers.get("Set-Cookie")).toBeNull();
    expect(tamperedResponse.headers.get("Set-Cookie")).toBeNull();

    if (expiredError.success && tamperedError.success) {
      expect(expiredError.data.error.code).toBe(
        "CHECKOUT_STATE_EXPIRED",
      );
      expect(tamperedError.data.error.code).toBe(
        "CHECKOUT_STATE_INVALID",
      );
      expect(JSON.stringify(tamperedError.data)).not.toContain(
        TEST_SIGNING_SECRET,
      );
    }
  });

  it("creates a real Prava hosted session without silently using mock", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "session_route_test_001",
          session_token: "TEST_ONLY_HOSTED_SESSION_TOKEN",
          iframe_url:
            "https://sandbox.collect.prava.space/checkout?mode=test",
          order_id: "order_route_test_001",
          expires_at: new Date(
            Date.now() + 10 * 60 * 1_000,
          ).toISOString(),
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = reviewToken();
    const response = await POST(
      request(
        approval(token),
        token,
        "https://fitora.example",
      ),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutSessionStartedSchema.safeParse(body);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(body).toMatchObject({
      ok: true,
      provider: "prava",
      hostedUrl:
        "https://sandbox.collect.prava.space/checkout?mode=test&session_token=TEST_ONLY_HOSTED_SESSION_TOKEN",
    });
    expect(
      response.cookies.get(
        checkoutAttemptCookieName(
          "session",
          reviewIdFromToken(token),
        ),
      )?.value,
    ).toBeTruthy();
    const refreshedReview = response.cookies.get(
      checkoutAttemptCookieName(
        "review",
        reviewIdFromToken(token),
      ),
    );
    const sessionCookie = response.cookies.get(
      checkoutAttemptCookieName(
        "session",
        reviewIdFromToken(token),
      ),
    );

    expect(refreshedReview?.value).toBeTruthy();
    expect(sessionCookie?.value).toBeTruthy();
    if (!refreshedReview || !sessionCookie) {
      throw new Error("Expected refreshed Prava checkout state.");
    }

    const refreshedClaims = verifyCheckoutToken(
      refreshedReview.value,
      TEST_SIGNING_SECRET,
    );
    expect(refreshedClaims).toMatchObject({ ok: true });
    if (refreshedClaims.ok) {
      expect(
        refreshedClaims.claims.exp - refreshedClaims.claims.iat,
      ).toBeGreaterThan(5 * 60);
    }
    const delayedReview = verifyCheckoutToken(
      refreshedReview.value,
      TEST_SIGNING_SECRET,
      { nowEpochSeconds: issuedAt + 7 * 60 },
    );

    expect(delayedReview).toMatchObject({ ok: true });
    if (delayedReview.ok) {
      expect(
        verifyPaymentSessionTokenForCheckout(
          sessionCookie.value,
          delayedReview.claims,
          TEST_SIGNING_SECRET,
          { nowEpochSeconds: issuedAt + 7 * 60 },
        ),
      ).toMatchObject({
        ok: true,
        claims: {
          provider: "prava",
          sessionId: "session_route_test_001",
        },
      });
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestInit = fetchMock.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const requestBody = JSON.parse(String(requestInit?.body)) as {
      integration_type?: string;
      callback_url?: string;
      total_amount?: string;
      purchase_context?: unknown[];
    };

    expect(requestBody).toMatchObject({
      integration_type: "full_checkout",
      callback_url: `https://fitora.example/checkout/callback/${reviewIdFromToken(token)}`,
      total_amount: expect.stringMatching(/^\d+\.\d{2}$/),
    });
    expect(requestBody.purchase_context).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(
      /route-placeholder|mock|sessionId|shopper@example\.com/i,
    );
  });

  it("retains an uncertain Prava creation tombstone instead of retrying the provider", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn().mockRejectedValue(
      new TypeError("simulated network failure"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();
    const attemptId =
      "51000000-0000-4000-8000-000000000051";
    const first = await POST(
      request(
        approval(token, "shopper@example.com", attemptId),
        token,
        "https://fitora.example",
      ),
    );
    const second = await POST(
      request(
        approval(token, "shopper@example.com", attemptId),
        token,
        "https://fitora.example",
      ),
    );

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(await first.json()).toMatchObject({
      error: { code: "PAYMENT_SESSION_UNCERTAIN" },
    });
    expect(await second.json()).toMatchObject({
      error: { code: "PAYMENT_SESSION_UNCERTAIN" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.headers.get("Set-Cookie")).toBeNull();
    expect(second.headers.get("Set-Cookie")).toBeNull();
  });

  it("coalesces concurrent Prava creation requests for the same approved checkout", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "session_route_concurrent_001",
          session_token: "TEST_ONLY_CONCURRENT_SESSION_TOKEN",
          iframe_url:
            "https://sandbox.collect.prava.space/checkout",
          order_id: "order_route_concurrent_001",
          expires_at: new Date(
            Date.now() + 10 * 60 * 1_000,
          ).toISOString(),
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();

    const [first, second] = await Promise.all([
      POST(
        request(
          approval(token),
          token,
          "https://fitora.example",
        ),
      ),
      POST(
        request(
          approval(token),
          token,
          "https://fitora.example",
        ),
      ),
    ]);
    const firstBody: unknown = await first.json();
    const secondBody: unknown = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody).toEqual(secondBody);
    expect(fetchMock).toHaveBeenCalledOnce();
    const attemptId = reviewIdFromToken(token);
    const firstSession = first.cookies.get(
      checkoutAttemptCookieName("session", attemptId),
    )?.value;
    const secondSession = second.cookies.get(
      checkoutAttemptCookieName("session", attemptId),
    )?.value;
    const firstReview = first.cookies.get(
      checkoutAttemptCookieName("review", attemptId),
    )?.value;
    const secondReview = second.cookies.get(
      checkoutAttemptCookieName("review", attemptId),
    )?.value;

    expect(firstSession).toBeTruthy();
    expect(secondSession).toBe(firstSession);
    expect(firstReview).toBeTruthy();
    expect(secondReview).toBe(firstReview);
  });

  it("isolates two form attempts that approve the same visible review", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const attemptA = "11000000-0000-4000-8000-000000000011";
    const attemptB = "12000000-0000-4000-8000-000000000012";
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: `session_route_isolated_00${call}`,
            session_token: `TEST_ONLY_ISOLATED_TOKEN_${call}`,
            iframe_url:
              "https://sandbox.collect.prava.space/checkout",
            order_id: `order_route_isolated_00${call}`,
            expires_at: new Date(
              Date.now() + 10 * 60 * 1_000,
            ).toISOString(),
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();

    const [first, second] = await Promise.all([
      POST(
        request(
          approval(token, "shopper@example.com", attemptA),
          token,
          "https://fitora.example",
        ),
      ),
      POST(
        request(
          approval(token, "shopper@example.com", attemptB),
          token,
          "https://fitora.example",
        ),
      ),
    ]);
    const firstSession = first.cookies.get(
      checkoutAttemptCookieName("session", attemptA),
    )?.value;
    const secondSession = second.cookies.get(
      checkoutAttemptCookieName("session", attemptB),
    )?.value;
    const firstReview = first.cookies.get(
      checkoutAttemptCookieName("review", attemptA),
    )?.value;
    const secondReview = second.cookies.get(
      checkoutAttemptCookieName("review", attemptB),
    )?.value;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstSession).toBeTruthy();
    expect(secondSession).toBeTruthy();
    expect(firstSession).not.toBe(secondSession);

    const firstClaims = verifyCheckoutToken(
      firstReview,
      TEST_SIGNING_SECRET,
    );
    const secondClaims = verifyCheckoutToken(
      secondReview,
      TEST_SIGNING_SECRET,
    );

    if (!firstClaims.ok || !secondClaims.ok) {
      throw new Error("Expected isolated review-state fixtures.");
    }

    expect(
      verifyPaymentSessionTokenForCheckout(
        firstSession,
        firstClaims.claims,
        TEST_SIGNING_SECRET,
      ),
    ).toMatchObject({ ok: true, claims: { attemptId: attemptA } });
    expect(
      verifyPaymentSessionTokenForCheckout(
        secondSession,
        secondClaims.claims,
        TEST_SIGNING_SECRET,
      ),
    ).toMatchObject({ ok: true, claims: { attemptId: attemptB } });

    const callbackUrls = fetchMock.mock.calls.map((entry) => {
      const init = entry[1] as RequestInit;
      const requestBody = JSON.parse(String(init.body)) as {
        callback_url?: string;
      };
      return requestBody.callback_url;
    });
    expect(callbackUrls).toEqual(
      expect.arrayContaining([
        `https://fitora.example/checkout/callback/${attemptA}`,
        `https://fitora.example/checkout/callback/${attemptB}`,
      ]),
    );
  });

  it("atomically limits concurrent distinct attempts for one signed review", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    let providerCall = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      providerCall += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: `session_route_throttled_00${providerCall}`,
            session_token: `TEST_ONLY_THROTTLED_TOKEN_${providerCall}`,
            iframe_url:
              "https://sandbox.collect.prava.space/checkout",
            order_id: `order_route_throttled_00${providerCall}`,
            expires_at: new Date(
              Date.now() + 10 * 60 * 1_000,
            ).toISOString(),
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();
    const attemptIds = [
      "41000000-0000-4000-8000-000000000041",
      "42000000-0000-4000-8000-000000000042",
      "43000000-0000-4000-8000-000000000043",
      "44000000-0000-4000-8000-000000000044",
    ] as const;

    const responses = await Promise.all(
      attemptIds.map((attemptId) =>
        POST(
          request(
            approval(token, "shopper@example.com", attemptId),
            token,
            "https://fitora.example",
          ),
        ),
      ),
    );
    const statuses = responses.map((response) => response.status);
    const limited = responses.find((response) => response.status === 429);

    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(limited?.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(await limited?.json()).toMatchObject({
      error: { code: "PAYMENT_ATTEMPT_LIMIT_REACHED" },
    });
  });

  it("atomically reserves one browser slot across concurrent distinct reviews", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    let providerCall = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      providerCall += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: `session_route_aggregate_00${providerCall}`,
            session_token: `TEST_ONLY_AGGREGATE_TOKEN_${providerCall}`,
            iframe_url:
              "https://sandbox.collect.prava.space/checkout",
            order_id: `order_route_aggregate_00${providerCall}`,
            expires_at: new Date(
              Date.now() + 10 * 60 * 1_000,
            ).toISOString(),
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const existingAttempts = [
      "61000000-0000-4000-8000-000000000061",
      "62000000-0000-4000-8000-000000000062",
    ] as const;
    const candidateAttempts = [
      "63000000-0000-4000-8000-000000000063",
      "64000000-0000-4000-8000-000000000064",
      "65000000-0000-4000-8000-000000000065",
    ] as const;
    const extraCookies = existingAttempts.flatMap((attemptId) =>
      activePravaAttemptCookies(attemptId),
    );
    const reviewTokens = candidateAttempts.map(() => reviewToken());

    const responses = await Promise.all(
      candidateAttempts.map((attemptId, index) => {
        const token = reviewTokens[index];

        if (!token) {
          throw new Error("Expected a concurrent review-token fixture.");
        }

        return POST(
          request(
            approval(token, "shopper@example.com", attemptId),
            token,
            "https://fitora.example",
            undefined,
            "application/json",
            undefined,
            undefined,
            extraCookies,
            TEST_BROWSER_ID,
          ),
        );
      }),
    );

    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a fourth valid active Prava attempt before any provider side effect and prunes terminal state", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const activeAttempts = [
      "21000000-0000-4000-8000-000000000021",
      "22000000-0000-4000-8000-000000000022",
      "23000000-0000-4000-8000-000000000023",
    ] as const;
    const terminalAttempt =
      "25000000-0000-4000-8000-000000000025";
    const terminal = issueTerminalCheckoutResult(
      orderFixture(),
      {
        provider: "prava",
        sessionId: "session_budget_terminal",
        status: "approved",
        orderReference: "FITORA-BUDGET-END",
      },
      TEST_SIGNING_SECRET,
    );
    const extraCookies = [
      ...activeAttempts.flatMap((attemptId) =>
        activePravaAttemptCookies(attemptId),
      ),
      `${checkoutAttemptCookieName("result", terminalAttempt)}=${terminal.token}`,
    ];
    const token = reviewToken();
    const newAttempt =
      "24000000-0000-4000-8000-000000000024";

    const response = await POST(
      request(
        approval(token, "shopper@example.com", newAttempt),
        token,
        "https://fitora.example",
        undefined,
        "application/json",
        undefined,
        undefined,
        extraCookies,
      ),
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(409);
    expect(CheckoutApiErrorSchema.safeParse(body)).toMatchObject({
      success: true,
      data: {
        error: { code: "PAYMENT_ATTEMPT_LIMIT_REACHED" },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("result", terminalAttempt),
      ),
    ).toMatchObject({ value: "" });
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("session", newAttempt),
      ),
    ).toBeUndefined();
    for (const attemptId of activeAttempts) {
      expect(
        response.cookies.get(
          checkoutAttemptCookieName("review", attemptId),
        ),
      ).toBeUndefined();
      expect(
        response.cookies.get(
          checkoutAttemptCookieName("session", attemptId),
        ),
      ).toBeUndefined();
    }
    expectNoStore(response);
  });

  it("prunes expired, invalid, and orphaned Prava sets before adding a session below the cap", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "session_route_budget_new",
          session_token: "TEST_ONLY_BUDGET_SESSION_TOKEN",
          iframe_url:
            "https://sandbox.collect.prava.space/checkout",
          order_id: "order_route_budget_new",
          expires_at: new Date(
            Date.now() + 10 * 60 * 1_000,
          ).toISOString(),
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const activeAttempts = [
      "31000000-0000-4000-8000-000000000031",
      "32000000-0000-4000-8000-000000000032",
    ] as const;
    const expiredAttempt =
      "33000000-0000-4000-8000-000000000033";
    const invalidAttempt =
      "34000000-0000-4000-8000-000000000034";
    const orphanedAttempt =
      "35000000-0000-4000-8000-000000000035";
    const newAttempt =
      "36000000-0000-4000-8000-000000000036";
    const terminal = issueTerminalCheckoutResult(
      orderFixture(),
      {
        provider: "prava",
        sessionId: "session_budget_orphaned",
        status: "declined",
        reasonCode: "PROVIDER_DECLINED",
      },
      TEST_SIGNING_SECRET,
    );
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const extraCookies = [
      ...activeAttempts.flatMap((attemptId) =>
        activePravaAttemptCookies(attemptId),
      ),
      ...activePravaAttemptCookies(expiredAttempt, {
        nowEpochSeconds: nowEpochSeconds - 120,
        ttlSeconds: 60,
      }),
      `${checkoutAttemptCookieName("review", invalidAttempt)}=invalid-review`,
      `${checkoutAttemptCookieName("session", invalidAttempt)}=invalid-session`,
      `${checkoutAttemptCookieName("result", orphanedAttempt)}=${terminal.token}`,
    ];
    const token = reviewToken();

    const response = await POST(
      request(
        approval(token, "shopper@example.com", newAttempt),
        token,
        "https://fitora.example",
        undefined,
        "application/json",
        undefined,
        undefined,
        extraCookies,
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    for (const [attemptId, kinds] of [
      [expiredAttempt, ["review", "session"]],
      [invalidAttempt, ["review", "session"]],
      [orphanedAttempt, ["result"]],
    ] as const) {
      for (const kind of kinds) {
        expect(
          response.cookies.get(
            checkoutAttemptCookieName(kind, attemptId),
          ),
        ).toMatchObject({ value: "" });
      }
    }
    for (const attemptId of activeAttempts) {
      expect(
        response.cookies.get(
          checkoutAttemptCookieName("review", attemptId),
        ),
      ).toBeUndefined();
      expect(
        response.cookies.get(
          checkoutAttemptCookieName("session", attemptId),
        ),
      ).toBeUndefined();
    }
    expect(
      response.cookies.get(
        checkoutAttemptCookieName("session", newAttempt),
      )?.value,
    ).toBeTruthy();
    expectNoStore(response);
  });

  it("rejects a retry that already carries a valid active Prava session", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "session_route_active_001",
          session_token: "TEST_ONLY_ACTIVE_SESSION_TOKEN",
          iframe_url:
            "https://sandbox.collect.prava.space/checkout",
          order_id: "order_route_active_001",
          expires_at: new Date(
            Date.now() + 10 * 60 * 1_000,
          ).toISOString(),
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const token = reviewToken();
    const first = await POST(
      request(
        approval(token),
        token,
        "https://fitora.example",
      ),
    );
    const activeReview = first.cookies.get(
      checkoutAttemptCookieName(
        "review",
        reviewIdFromToken(token),
      ),
    )?.value;
    const activeSession = first.cookies.get(
      checkoutAttemptCookieName(
        "session",
        reviewIdFromToken(token),
      ),
    )?.value;

    expect(first.status).toBe(200);
    expect(activeReview).toBeTruthy();
    expect(activeSession).toBeTruthy();

    const retry = await POST(
      request(
        approval(activeReview ?? token),
        activeReview,
        "https://fitora.example",
        undefined,
        "application/json",
        activeSession,
        reviewIdFromToken(token),
      ),
    );
    const retryBody: unknown = await retry.json();

    expect(retry.status).toBe(409);
    expect(retryBody).toMatchObject({
      error: { code: "PAYMENT_SESSION_ACTIVE" },
    });
    expect(retry.headers.get("Set-Cookie")).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
