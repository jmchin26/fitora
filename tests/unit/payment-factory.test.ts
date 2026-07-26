import { describe, expect, it, vi } from "vitest";

import { resolvePaymentProvider } from "@/lib/payments/factory";
import type { PravaClient } from "@/lib/payments/prava";

const PRAVA_TEST_SECRET = ["sk", "test", "factory-placeholder"].join(
  "_",
);
const CHECKOUT_SIGNING_SECRET =
  "payment-factory-test-signing-secret-123456789";

describe("payment provider factory", () => {
  it("boots in truthful mock mode by default", () => {
    const resolution = resolvePaymentProvider({ environment: {} });

    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.configured).toBe("mock");
      expect(resolution.provider.name).toBe("mock");
    }
  });

  it("marks incomplete Prava configuration invalid without using mock", () => {
    expect(
      resolvePaymentProvider({
        environment: { PAYMENT_PROVIDER: "prava" },
      }),
    ).toMatchObject({
      status: "invalid",
      configured: "prava",
      reason: "INVALID_CONFIGURATION",
    });
  });

  it("creates a real Prava adapter only from complete server configuration", () => {
    const client: PravaClient = {
      createSession: vi.fn(),
      getPaymentResult: vi.fn(),
      pollPaymentResult: vi.fn(),
      reportStatus: vi.fn(),
    };
    const resolution = resolvePaymentProvider({
      environment: {
        NODE_ENV: "test",
        PAYMENT_PROVIDER: "prava",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        CHECKOUT_SIGNING_SECRET,
        PRAVA_SECRET_KEY: PRAVA_TEST_SECRET,
        DEMO_MERCHANT_URL: "https://merchant.fitora.example",
      },
      pravaClient: client,
    });

    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.configured).toBe("prava");
      expect(resolution.provider.name).toBe("prava");
    }
  });

  it("returns typed invalid resolutions for unknown or malformed config", () => {
    expect(
      resolvePaymentProvider({
        environment: { PAYMENT_PROVIDER: "surprise" },
      }),
    ).toMatchObject({
      status: "invalid",
      configured: "invalid",
      requested: "surprise",
      reason: "INVALID_CONFIGURATION",
    });

    expect(
      resolvePaymentProvider({
        environment: {
          PAYMENT_PROVIDER: "mock",
          NEXT_PUBLIC_APP_URL: "not a URL",
        },
      }),
    ).toMatchObject({
      status: "invalid",
      configured: "mock",
      reason: "INVALID_CONFIGURATION",
    });

    expect(
      resolvePaymentProvider({
        environment: {
          PAYMENT_PROVIDER: "mock",
          DEMO_MERCHANT_FORCE_DECLINE: "yes",
        },
      }),
    ).toMatchObject({
      status: "invalid",
      configured: "mock",
      reason: "INVALID_CONFIGURATION",
    });
  });

  it("accepts the force-decline switch only from injected server config", () => {
    const resolution = resolvePaymentProvider({
      environment: {
        PAYMENT_PROVIDER: "mock",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_FORCE_DECLINE: "true",
      },
    });

    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.provider.name).toBe("mock");
    }
  });
});
