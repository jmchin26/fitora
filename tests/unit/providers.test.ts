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
    process.env.AI_PROVIDER = "ollama";
    process.env.PAYMENT_PROVIDER = "prava";

    expect(getProviderModes()).toEqual({ ai: "ollama", payment: "prava" });

    process.env.AI_PROVIDER = "unsupported-ai";
    process.env.PAYMENT_PROVIDER = "unsupported-payment";

    expect(getProviderModes()).toEqual({
      ai: "invalid",
      payment: "invalid",
    });
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
