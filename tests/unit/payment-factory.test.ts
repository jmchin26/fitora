import { describe, expect, it } from "vitest";

import { resolvePaymentProvider } from "@/lib/payments/factory";

describe("payment provider factory", () => {
  it("boots in truthful mock mode by default", () => {
    const resolution = resolvePaymentProvider({ environment: {} });

    expect(resolution.status).toBe("ready");
    if (resolution.status === "ready") {
      expect(resolution.configured).toBe("mock");
      expect(resolution.provider.name).toBe("mock");
    }
  });

  it("marks Prava unavailable instead of silently substituting mock", () => {
    expect(
      resolvePaymentProvider({
        environment: { PAYMENT_PROVIDER: "prava" },
      }),
    ).toEqual({
      status: "unavailable",
      configured: "prava",
      reason: "NOT_IMPLEMENTED",
      message:
        "Prava is selected, but its hosted checkout provider is not implemented yet.",
    });
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
