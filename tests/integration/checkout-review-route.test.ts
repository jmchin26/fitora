import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/checkout/review/route";
import {
  CheckoutApiErrorSchema,
  CheckoutReviewStartedSchema,
} from "@/lib/checkout/api-contracts";
import {
  CHECKOUT_BROWSER_ID_COOKIE_NAME,
  CHECKOUT_COOKIE_NAMES,
  checkoutAttemptCookieName,
} from "@/lib/checkout/cookies";
import { verifyCheckoutOrder } from "@/lib/checkout/order";
import {
  verifyCheckoutTokenForOrder,
} from "@/lib/checkout/token";

const TEST_SIGNING_SECRET =
  "fitora-checkout-review-route-test-signing-secret";

const validRequestBody = {
  outfit: {
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
  },
} as const;

type JsonRequestOptions = {
  requestOrigin?: string;
  originHeader?: string;
  contentType?: string | null;
  cookieHeader?: string;
};

function jsonRequest(
  body: unknown,
  options: JsonRequestOptions = {},
): NextRequest {
  const requestOrigin = options.requestOrigin ?? "http://localhost:3000";
  const contentType =
    options.contentType === undefined
      ? "application/json"
      : options.contentType;

  return new NextRequest(`${requestOrigin}/api/checkout/review`, {
    method: "POST",
    headers: {
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(options.originHeader
        ? { Origin: options.originHeader }
        : {}),
      ...(options.cookieHeader
        ? { Cookie: options.cookieHeader }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(): NextRequest {
  return new NextRequest("http://localhost/api/checkout/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: '{"outfit":',
  });
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

beforeEach(() => {
  vi.stubEnv("PAYMENT_PROVIDER", "mock");
  vi.stubEnv("CHECKOUT_SIGNING_SECRET", TEST_SIGNING_SECRET);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("PRAVA_SECRET_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/checkout/review", () => {
  it("rehydrates the order, signs review state, and clears stale checkout cookies", async () => {
    const response = await POST(jsonRequest(validRequestBody));
    const body: unknown = await response.json();
    const parsed = CheckoutReviewStartedSchema.safeParse(body);
    const reviewCookie = response.cookies.get(
      CHECKOUT_COOKIE_NAMES.review,
    );
    const browserCookie = response.cookies.get(
      CHECKOUT_BROWSER_ID_COOKIE_NAME,
    );
    const verifiedOrder = verifyCheckoutOrder(validRequestBody);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(reviewCookie?.value).toBeTruthy();
    expect(browserCookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.session),
    ).toMatchObject({ value: "" });
    expect(
      response.cookies.get(CHECKOUT_COOKIE_NAMES.result),
    ).toMatchObject({ value: "" });

    if (!verifiedOrder.ok || !reviewCookie) {
      throw new Error("The checkout route fixture must produce review state.");
    }

    expect(
      verifyCheckoutTokenForOrder(
        reviewCookie.value,
        verifiedOrder.order,
        TEST_SIGNING_SECRET,
      ),
    ).toMatchObject({ ok: true });

    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.review}=`);
    expect(setCookie).toContain(`${CHECKOUT_BROWSER_ID_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.session}=`);
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.result}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("preserves an existing opaque browser scope across fresh reviews", async () => {
    const browserId = "f0000000-0000-4000-8000-00000000000f";
    const response = await POST(
      jsonRequest(validRequestBody, {
        cookieHeader: `${CHECKOUT_BROWSER_ID_COOKIE_NAME}=${browserId}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(
      response.cookies.get(CHECKOUT_BROWSER_ID_COOKIE_NAME),
    ).toMatchObject({ value: browserId });
  });

  it("sets Secure on checkout cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");

    const response = await POST(
      jsonRequest(validRequestBody, {
        requestOrigin: "https://fitora.example",
        originHeader: "https://fitora.example",
      }),
    );
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain("Secure");
    expectNoStore(response);
  });

  it("creates a new review without overwriting another Prava attempt's scoped cookies", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv(
      "PRAVA_SECRET_KEY",
      ["sk", "test", "review-active-placeholder"].join("_"),
    );
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");
    const attemptId = "a0000000-0000-4000-8000-00000000000a";
    const attemptReviewName = checkoutAttemptCookieName(
      "review",
      attemptId,
    );
    const attemptSessionName = checkoutAttemptCookieName(
      "session",
      attemptId,
    );
    const response = await POST(
      jsonRequest(validRequestBody, {
        requestOrigin: "https://fitora.example",
        originHeader: "https://fitora.example",
        cookieHeader: `${attemptReviewName}=signed-attempt-review; ${attemptSessionName}=signed-attempt-session`,
      }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${CHECKOUT_COOKIE_NAMES.review}=`);
    expect(setCookie).not.toContain(attemptReviewName);
    expect(setCookie).not.toContain(attemptSessionName);
    expectNoStore(response);
  });

  it("rejects text/plain and sibling-origin requests before setting state", async () => {
    const textPlain = await POST(
      jsonRequest(validRequestBody, {
        contentType: "text/plain",
        originHeader: "http://localhost:3000",
      }),
    );
    const sibling = await POST(
      jsonRequest(validRequestBody, {
        originHeader: "http://shop.localhost:3000",
      }),
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

  it("rejects malformed JSON without setting checkout state", async () => {
    const response = await POST(malformedJsonRequest());
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(400);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(response.headers.get("Set-Cookie")).toBeNull();

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("INVALID_JSON");
      expect(parsed.data.error).not.toHaveProperty("issues");
    }
  });

  it("enforces the strict review request contract", async () => {
    const response = await POST(
      jsonRequest({
        ...validRequestBody,
        clientTotalCents: 1,
      }),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(400);
    expect(parsed.success).toBe(true);
    expectNoStore(response);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("INVALID_CHECKOUT_REQUEST");
      expect(JSON.stringify(parsed.data)).not.toContain("clientTotalCents");
    }
  });

  it("rejects an unknown catalogue product with a sanitized conflict", async () => {
    const response = await POST(
      jsonRequest({
        outfit: {
          ...validRequestBody.outfit,
          top: {
            ...validRequestBody.outfit.top,
            productId: "top-99",
          },
        },
      }),
    );
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(409);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(response.headers.get("Set-Cookie")).toBeNull();

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("CHECKOUT_STATE_INVALID");
      expect(JSON.stringify(parsed.data)).not.toMatch(
        /top-99|stock|merchant|catalogue/i,
      );
    }
  });

  it("returns a sanitized failure when server checkout configuration is invalid", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "prava");

    const response = await POST(jsonRequest(validRequestBody));
    const body: unknown = await response.json();
    const parsed = CheckoutApiErrorSchema.safeParse(body);

    expect(response.status).toBe(500);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(response.headers.get("Set-Cookie")).toBeNull();

    if (parsed.success) {
      expect(parsed.data.error.code).toBe(
        "CHECKOUT_CONFIGURATION_INVALID",
      );
      expect(JSON.stringify(parsed.data)).not.toMatch(
        /secret|PRAVA_SECRET_KEY|checkoutSigningSecret|issues/i,
      );
    }
  });
});
