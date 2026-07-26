import { describe, expect, it } from "vitest";

import {
  ServerEnvironmentConfigurationError,
  getServerEnvironment,
  parseServerEnvironment,
} from "@/lib/config/env";

const STRONG_SIGNING_SECRET = "test-signing-secret-with-at-least-32-characters";

function expectInvalid(
  environment: Readonly<Record<string, string | undefined>>,
  expectedPath: string,
): void {
  const result = parseServerEnvironment(environment);

  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error("Expected environment validation to fail.");
  }

  expect(result.issues.some((issue) => issue.path === expectedPath)).toBe(true);
}

describe("checkout server environment", () => {
  it("boots locally in explicit mock mode with safe defaults", () => {
    const result = parseServerEnvironment({ NODE_ENV: "development" });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Development defaults must be valid.");
    }

    expect(result.config).toMatchObject({
      nodeEnv: "development",
      isProduction: false,
      paymentProvider: "mock",
      appUrl: "http://localhost:3000",
      usesDevelopmentSigningSecret: true,
      prava: {
        baseUrl: "https://sandbox.api.prava.space",
        ready: false,
      },
      merchant: {
        name: "Fitora Demo Merchant",
        url: "http://localhost:3000",
        countryCode: "US",
        forceDecline: false,
      },
    });
    expect(result.config.checkoutSigningSecret.length).toBeGreaterThanOrEqual(
      32,
    );
  });

  it("allows the same marked fallback in test mock mode", () => {
    const config = getServerEnvironment({ NODE_ENV: "test" });

    expect(config.paymentProvider).toBe("mock");
    expect(config.usesDevelopmentSigningSecret).toBe(true);
  });

  it("uses an explicitly configured signing secret without exposing it in errors", () => {
    const result = parseServerEnvironment({
      NODE_ENV: "development",
      CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Configured development environment must be valid.");
    }

    expect(result.config.checkoutSigningSecret).toBe(STRONG_SIGNING_SECRET);
    expect(result.config.usesDevelopmentSigningSecret).toBe(false);

    const sensitiveValue = "short-but-sensitive";
    const invalid = parseServerEnvironment({
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "mock",
      NEXT_PUBLIC_APP_URL: "https://fitora.example",
      CHECKOUT_SIGNING_SECRET: sensitiveValue,
    });

    expect(JSON.stringify(invalid)).not.toContain(sensitiveValue);
  });

  it("rejects a missing or short production signing secret", () => {
    const productionBase = {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "mock",
      NEXT_PUBLIC_APP_URL: "https://fitora.example",
    } as const;

    expectInvalid(productionBase, "checkoutSigningSecret");
    expectInvalid(
      { ...productionBase, CHECKOUT_SIGNING_SECRET: "too-short" },
      "checkoutSigningSecret",
    );
  });

  it("requires an explicit application origin in production", () => {
    expectInvalid(
      {
        NODE_ENV: "production",
        CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
      },
      "appUrl",
    );
  });

  it("requires HTTPS application and merchant origins in production", () => {
    const productionBase = {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "mock",
      CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
    } as const;

    expectInvalid(
      {
        ...productionBase,
        NEXT_PUBLIC_APP_URL: "http://fitora.example",
      },
      "appUrl",
    );
    expectInvalid(
      {
        ...productionBase,
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_URL: "http://merchant.fitora.example",
      },
      "merchantUrl",
    );
  });

  it.each(["", "Mock", "prava ", "stripe", "rules"])(
    "rejects invalid payment provider %j",
    (paymentProvider) => {
      expectInvalid(
        { NODE_ENV: "development", PAYMENT_PROVIDER: paymentProvider },
        "paymentProvider",
      );
    },
  );

  it.each([
    "ftp://fitora.example",
    "https://user:password@fitora.example",
    "https://fitora.example/checkout",
    "https://fitora.example?source=test",
    "https://fitora.example#checkout",
    " https://fitora.example",
  ])("rejects non-origin application URL %j", (appUrl) => {
    expectInvalid(
      { NODE_ENV: "development", NEXT_PUBLIC_APP_URL: appUrl },
      "appUrl",
    );
  });

  it("normalizes valid origins and defaults the merchant URL to the app origin", () => {
    const config = getServerEnvironment({
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "https://FITORA.example:443/",
    });

    expect(config.appUrl).toBe("https://fitora.example");
    expect(config.merchant.url).toBe("https://fitora.example");
  });

  it.each([
    ["DEMO_MERCHANT_URL", "javascript:alert(1)", "merchantUrl"],
    ["DEMO_MERCHANT_NAME", "<script>", "merchantName"],
    ["DEMO_MERCHANT_COUNTRY_CODE", "us", "merchantCountryCode"],
    ["DEMO_MERCHANT_COUNTRY_CODE", "USA", "merchantCountryCode"],
  ] as const)("rejects unsafe merchant configuration in %s", (key, value, path) => {
    expectInvalid({ NODE_ENV: "development", [key]: value }, path);
  });

  it.each(["TRUE", "False", "1", "yes", ""])(
    "rejects forced-decline boolean %j",
    (value) => {
      expectInvalid(
        { NODE_ENV: "development", DEMO_MERCHANT_FORCE_DECLINE: value },
        "forceMerchantDecline",
      );
    },
  );

  it("parses only exact forced-decline booleans", () => {
    expect(
      getServerEnvironment({
        NODE_ENV: "development",
        DEMO_MERCHANT_FORCE_DECLINE: "true",
      }).merchant.forceDecline,
    ).toBe(true);
    expect(
      getServerEnvironment({
        NODE_ENV: "development",
        DEMO_MERCHANT_FORCE_DECLINE: "false",
      }).merchant.forceDecline,
    ).toBe(false);
  });

  it("requires complete secure Prava configuration when Prava is selected", () => {
    const pravaBase = {
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "prava",
      NEXT_PUBLIC_APP_URL: "https://fitora.example",
      CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
    } as const;

    expectInvalid(pravaBase, "pravaSecretKey");
    expectInvalid(
      {
        ...pravaBase,
        PRAVA_SECRET_KEY: "unit-test-prava-placeholder",
        PRAVA_BASE_URL: "http://sandbox.api.prava.space",
      },
      "pravaBaseUrl",
    );

    const config = getServerEnvironment({
      ...pravaBase,
      PRAVA_SECRET_KEY: "unit-test-prava-placeholder",
      PRAVA_BASE_URL: "https://sandbox.api.prava.space",
    });
    expect(config.paymentProvider).toBe("prava");
    expect(config.prava.ready).toBe(true);
    expect(config.usesDevelopmentSigningSecret).toBe(false);
  });

  it("requires HTTPS application and merchant origins whenever Prava is selected", () => {
    const pravaBase = {
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "prava",
      CHECKOUT_SIGNING_SECRET: STRONG_SIGNING_SECRET,
      PRAVA_SECRET_KEY: "unit-test-prava-placeholder",
    } as const;

    expectInvalid(
      {
        ...pravaBase,
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
      "appUrl",
    );
    expectInvalid(
      {
        ...pravaBase,
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        DEMO_MERCHANT_URL: "http://merchant.fitora.example",
      },
      "merchantUrl",
    );
  });

  it("throws a sanitized configuration error from the strict accessor", () => {
    const sensitiveValue = "sensitive-short-secret";

    expect(() =>
      getServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        CHECKOUT_SIGNING_SECRET: sensitiveValue,
      }),
    ).toThrow(ServerEnvironmentConfigurationError);

    try {
      getServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://fitora.example",
        CHECKOUT_SIGNING_SECRET: sensitiveValue,
      });
    } catch (error) {
      expect(String(error)).not.toContain(sensitiveValue);
      expect(JSON.stringify(error)).not.toContain(sensitiveValue);
    }
  });
});
