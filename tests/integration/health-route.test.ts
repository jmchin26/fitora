import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

const STRONG_SIGNING_SECRET =
  "health-route-test-signing-secret-123456789012345";
const PRAVA_TEST_SECRET = ["sk", "test", "unit-test-placeholder"].join(
  "_",
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("reports truthful safe defaults without exposing configuration", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "rules");
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("CHECKOUT_SIGNING_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("DEMO_MERCHANT_URL", "http://localhost:3000");

    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      providers: { ai: string; payment: string };
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "fitora",
      providers: { ai: "rules", payment: "mock" },
    });
    expect(JSON.stringify(body)).not.toMatch(/key|secret|token/i);
  });

  it.each([
    [
      "Prava is missing its secret",
      {
        PAYMENT_PROVIDER: "prava",
        CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
        PRAVA_SECRET_KEY: "",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_URL: "https://merchant.fitora.example",
      },
    ],
    [
      "Prava uses an insecure application origin",
      {
        PAYMENT_PROVIDER: "prava",
        CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
        PRAVA_SECRET_KEY: PRAVA_TEST_SECRET,
        NEXT_PUBLIC_APP_URL: "http://fitora.example",
        DEMO_MERCHANT_URL: "https://merchant.fitora.example",
      },
    ],
    [
      "production mock is missing its signing secret",
      {
        PAYMENT_PROVIDER: "mock",
        CHECKOUT_SIGNING_SECRET: "",
        PRAVA_SECRET_KEY: "",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_URL: "https://merchant.fitora.example",
      },
    ],
  ] as const)("reports only a safe invalid mode when %s", async (_name, environment) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "rules");
    Object.entries(environment).forEach(([key, value]) => {
      vi.stubEnv(key, value);
    });

    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      providers: { ai: string; payment: string };
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "fitora",
      providers: { ai: "rules", payment: "invalid" },
    });
    expect(serialized).not.toMatch(
      /CHECKOUT_SIGNING_SECRET|PRAVA_SECRET_KEY|issues|https?:\/\//i,
    );
  });

  it("reports configured Prava only when its payment environment is valid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv("CHECKOUT_SIGNING_SECRET", STRONG_SIGNING_SECRET);
    vi.stubEnv("PRAVA_SECRET_KEY", PRAVA_TEST_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      status: "ok",
      service: "fitora",
      providers: { ai: "gemini", payment: "prava" },
    });
    expect(JSON.stringify(body)).not.toMatch(/placeholder|secret|key/i);
  });
});
