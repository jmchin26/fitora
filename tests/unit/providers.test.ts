import { afterEach, describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  PAYMENT_PROVIDERS,
  getProviderModes,
  providerModeLabels,
  safeAiProvider,
  safePaymentProvider,
  type AiProvider,
  type PaymentProvider,
} from "@/lib/config/providers";

const originalAiProvider = process.env.AI_PROVIDER;
const originalPaymentProvider = process.env.PAYMENT_PROVIDER;
const STRONG_SIGNING_SECRET =
  "provider-readiness-unit-test-signing-secret-123456";
const PRAVA_TEST_SECRET = ["sk", "test", "unit-test-placeholder"].join(
  "_",
);
const VALID_PRODUCTION_PAYMENT_ENVIRONMENT = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://fitora.example",
  DEMO_MERCHANT_URL: "https://merchant.fitora.example",
  CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
} as const;

function restoreEnvironmentVariable(
  key: "AI_PROVIDER" | "PAYMENT_PROVIDER",
  originalValue: string | undefined,
): void {
  if (originalValue === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = originalValue;
}

afterEach(() => {
  restoreEnvironmentVariable("AI_PROVIDER", originalAiProvider);
  restoreEnvironmentVariable("PAYMENT_PROVIDER", originalPaymentProvider);
});

describe("provider configuration", () => {
  it("uses safe local defaults when values are absent", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.PAYMENT_PROVIDER;

    expect(safeAiProvider()).toBe("rules");
    expect(safePaymentProvider()).toBe("mock");
    expect(getProviderModes({ NODE_ENV: "test" })).toEqual({
      ai: "rules",
      payment: "mock",
    });
  });

  it.each(AI_PROVIDERS)("accepts the supported AI provider %s", (provider) => {
    expect(safeAiProvider(provider)).toBe(provider);
  });

  it.each(PAYMENT_PROVIDERS)(
    "accepts the supported payment provider %s",
    (provider) => {
      expect(safePaymentProvider(provider)).toBe(provider);
    },
  );

  it.each(["", "Rules", "gemini ", "prava", "unknown"])(
    "rejects invalid AI provider value %j",
    (provider) => {
      expect(safeAiProvider(provider)).toBe("invalid");
    },
  );

  it.each(["", "Mock", "prava ", "gemini", "unknown"])(
    "rejects invalid payment provider value %j",
    (provider) => {
      expect(safePaymentProvider(provider)).toBe("invalid");
    },
  );

  it("resolves configured environment modes without silently falling back", () => {
    expect(
      getProviderModes({
        ...VALID_PRODUCTION_PAYMENT_ENVIRONMENT,
        AI_PROVIDER: "ollama",
        PAYMENT_PROVIDER: "prava",
        PRAVA_SECRET_KEY: PRAVA_TEST_SECRET,
      }),
    ).toEqual({ ai: "ollama", payment: "prava" });

    expect(
      getProviderModes({
        NODE_ENV: "test",
        AI_PROVIDER: "unsupported-ai",
        PAYMENT_PROVIDER: "unsupported-payment",
      }),
    ).toEqual({
      ai: "invalid",
      payment: "invalid",
    });
  });

  it.each([
    [
      "Prava without its server secret",
      {
        ...VALID_PRODUCTION_PAYMENT_ENVIRONMENT,
        PAYMENT_PROVIDER: "prava",
      },
    ],
    [
      "Prava with an insecure application origin",
      {
        ...VALID_PRODUCTION_PAYMENT_ENVIRONMENT,
        PAYMENT_PROVIDER: "prava",
        PRAVA_SECRET_KEY: PRAVA_TEST_SECRET,
        NEXT_PUBLIC_APP_URL: "http://fitora.example",
      },
    ],
    [
      "Prava with an insecure merchant origin",
      {
        ...VALID_PRODUCTION_PAYMENT_ENVIRONMENT,
        PAYMENT_PROVIDER: "prava",
        PRAVA_SECRET_KEY: PRAVA_TEST_SECRET,
        DEMO_MERCHANT_URL: "http://merchant.fitora.example",
      },
    ],
    [
      "production mock without a signing secret",
      {
        NODE_ENV: "production",
        PAYMENT_PROVIDER: "mock",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_URL: "https://merchant.fitora.example",
      },
    ],
  ] as const)("marks payment invalid for %s", (_name, environment) => {
    const modes = getProviderModes(environment);

    expect(modes).toEqual({ ai: "rules", payment: "invalid" });
    expect(providerModeLabels(modes)).toEqual([
      "Rules fallback",
      "Invalid payment configuration",
    ]);
  });
});

describe("provider display labels", () => {
  it.each<[AiProvider, string]>([
    ["rules", "Rules fallback"],
    ["gemini", "Gemini"],
    ["ollama", "Local Ollama"],
    ["invalid", "Invalid AI configuration"],
  ])("labels AI mode %s truthfully", (ai, expectedLabel) => {
    expect(providerModeLabels({ ai, payment: "mock" })[0]).toBe(
      expectedLabel,
    );
  });

  it.each<[PaymentProvider, string]>([
    ["mock", "Mock payment mode"],
    ["prava", "Prava sandbox"],
    ["invalid", "Invalid payment configuration"],
  ])("labels payment mode %s truthfully", (payment, expectedLabel) => {
    expect(providerModeLabels({ ai: "rules", payment })[1]).toBe(
      expectedLabel,
    );
  });

  it("surfaces both invalid configuration labels together", () => {
    expect(providerModeLabels({ ai: "invalid", payment: "invalid" })).toEqual(
      ["Invalid AI configuration", "Invalid payment configuration"],
    );
  });
});
