import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/checkout/create-session/route";
import {
  CheckoutApiErrorSchema,
  CheckoutSessionStartedSchema,
} from "@/lib/checkout/api-contracts";
import { CHECKOUT_COOKIE_NAMES } from "@/lib/checkout/cookies";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
} from "@/lib/checkout/token";
import { verifyPaymentSessionTokenForCheckout } from "@/lib/checkout/workflow";

const TEST_SIGNING_SECRET =
  "fitora-create-session-route-test-signing-secret";

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

function request(
  body: unknown,
  token?: string,
  origin = "http://localhost:3000",
  originHeader?: string,
  contentType: string | null = "application/json",
): NextRequest {
  return new NextRequest(`${origin}/api/checkout/create-session`, {
    method: "POST",
    headers: {
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(originHeader ? { Origin: originHeader } : {}),
      ...(token
        ? {
            Cookie: `${CHECKOUT_COOKIE_NAMES.review}=${token}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
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
});

describe("POST /api/checkout/create-session", () => {
  it("creates a bound mock session only after approval without returning email or a session id", async () => {
    const token = reviewToken();
    const response = await POST(
      request({ email: " shopper@example.com " }, token),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutSessionStartedSchema.safeParse(body);
    const sessionCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.session,
    );
    const checkoutClaims = verifyCheckoutToken(
      token,
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

    const response = await POST(
      request(
        { email: "shopper@example.com" },
        reviewToken(),
        "https://fitora.example",
        "https://fitora.example",
      ),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("Secure");
    expect(setCookie.match(/Secure/g)).toHaveLength(2);
    expectNoStore(response);
  });

  it("rejects text/plain and sibling-origin approval requests before creating a session", async () => {
    const token = reviewToken();
    const textPlain = await POST(
      request(
        { email: "shopper@example.com" },
        token,
        "http://localhost:3000",
        "http://localhost:3000",
        "text/plain",
      ),
    );
    const sibling = await POST(
      request(
        { email: "shopper@example.com" },
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
    const extraField = await POST(
      request(
        {
          email: "shopper@example.com",
          clientTotalCents: 1,
        },
        reviewToken(),
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

  it("requires reviewed checkout state", async () => {
    const response = await POST(
      request({ email: "shopper@example.com" }),
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
      request({ email: "shopper@example.com" }, expired),
    );
    const expiredBody: unknown = await expiredResponse.json();
    const expiredError =
      CheckoutApiErrorSchema.safeParse(expiredBody);
    const tamperedResponse = await POST(
      request({ email: "shopper@example.com" }, tampered),
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

  it("reports configured Prava as unavailable without silently using mock", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("PRAVA_SECRET_KEY", "prava-server-test-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");

    const response = await POST(
      request(
        { email: "shopper@example.com" },
        reviewToken(),
        "https://fitora.example",
      ),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(503);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(
      /prava-server-test-secret|mock|sessionId/i,
    );

    if (parsed.success) {
      expect(parsed.data.error.code).toBe(
        "PAYMENT_PROVIDER_UNAVAILABLE",
      );
    }
  });
});
