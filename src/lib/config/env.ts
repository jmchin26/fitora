import { z } from "zod";

/**
 * This module is a server-only configuration boundary. Do not import it from a
 * client component: the returned configuration contains payment secrets.
 */

const LOCAL_APP_ORIGIN = "http://localhost:3000";
const DEFAULT_PRAVA_ORIGIN = "https://sandbox.api.prava.space";
const DEFAULT_PRAVA_HOSTED_CHECKOUT_ORIGIN =
  "https://sandbox.collect.prava.space";
const PRAVA_SECRET_KEY_PATTERN =
  /^sk_test_[A-Za-z0-9._~-]{8,}$/;
const DEFAULT_MERCHANT_NAME = "Fitora";
const DEFAULT_MERCHANT_COUNTRY_CODE = "US";

// Deliberately well-known and explicitly development-only. It keeps the local
// mock path usable, but must never be treated as a deployable secret.
const DEVELOPMENT_MOCK_ONLY_SIGNING_SECRET =
  "fitora-development-mock-only-signing-secret-not-for-production";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);
const paymentProviderSchema = z.enum(["mock", "prava"]);

const httpOriginSchema = z.string().min(1).transform((value, context) => {
  if (value !== value.trim()) {
    context.addIssue({
      code: "custom",
      message: "Must not have leading or trailing whitespace.",
    });
    return z.NEVER;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Must be a valid HTTP(S) origin.",
    });
    return z.NEVER;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Must be an HTTP(S) origin without credentials, a path, query, or hash.",
    });
    return z.NEVER;
  }

  return url.origin;
});

const merchantNameSchema = z
  .string()
  .min(2)
  .max(80)
  .refine((value) => value === value.trim(), {
    message: "Must not have leading or trailing whitespace.",
  })
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
      }),
    { message: "Must not contain control characters." },
  )
  .refine((value) => !value.includes("<") && !value.includes(">"), {
    message: "Must not contain markup delimiters.",
  });

const merchantCountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, {
  message: "Must be a two-letter uppercase country code.",
});

const rawServerEnvironmentSchema = z
  .object({
    nodeEnv: nodeEnvironmentSchema,
    paymentProvider: paymentProviderSchema,
    appUrl: httpOriginSchema,
    checkoutSigningSecret: z
      .string()
      .min(32)
      .refine((value) => value === value.trim(), {
        message: "Must not have leading or trailing whitespace.",
      })
      .optional(),
    pravaSecretKey: z
      .string()
      .min(1)
      .refine((value) => value === value.trim(), {
        message: "Must not have leading or trailing whitespace.",
      })
      .optional(),
    pravaBaseUrl: httpOriginSchema,
    pravaHostedCheckoutOrigin: httpOriginSchema.optional(),
    merchantName: merchantNameSchema,
    merchantUrl: httpOriginSchema,
    merchantCountryCode: merchantCountryCodeSchema,
    forceMerchantDecline: z.enum(["true", "false"]).transform((value) =>
      value === "true",
    ),
  })
  .superRefine((environment, context) => {
    const mayUseDevelopmentSecret =
      environment.nodeEnv !== "production" &&
      environment.paymentProvider === "mock";
    const securePublicOriginsRequired =
      environment.nodeEnv === "production" ||
      environment.paymentProvider === "prava";

    if (!environment.checkoutSigningSecret && !mayUseDevelopmentSecret) {
      context.addIssue({
        code: "custom",
        path: ["checkoutSigningSecret"],
        message:
          "A signing secret of at least 32 characters is required for this runtime.",
      });
    }

    if (
      environment.paymentProvider === "prava" &&
      !environment.pravaSecretKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["pravaSecretKey"],
        message: "A server-side Prava secret key is required in Prava mode.",
      });
    }

    if (
      environment.paymentProvider === "prava" &&
      !environment.pravaHostedCheckoutOrigin
    ) {
      context.addIssue({
        code: "custom",
        path: ["pravaHostedCheckoutOrigin"],
        message:
          "An exact Prava hosted-checkout origin is required in Prava mode.",
      });
    }

    if (
      environment.paymentProvider === "prava" &&
      !environment.pravaBaseUrl.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["pravaBaseUrl"],
        message: "Prava mode requires an HTTPS API origin.",
      });
    }

    if (
      environment.paymentProvider === "prava" &&
      environment.pravaHostedCheckoutOrigin &&
      !environment.pravaHostedCheckoutOrigin.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["pravaHostedCheckoutOrigin"],
        message: "Prava mode requires an HTTPS hosted-checkout origin.",
      });
    }

    if (
      environment.paymentProvider === "prava" &&
      environment.pravaSecretKey &&
      !PRAVA_SECRET_KEY_PATTERN.test(environment.pravaSecretKey)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pravaSecretKey"],
        message: "The Prava secret key format is invalid.",
      });
    }

    if (environment.paymentProvider === "prava") {
      const sandboxConfiguration =
        environment.pravaBaseUrl === DEFAULT_PRAVA_ORIGIN &&
        environment.pravaHostedCheckoutOrigin ===
          DEFAULT_PRAVA_HOSTED_CHECKOUT_ORIGIN &&
        environment.pravaSecretKey?.startsWith("sk_test_");

      if (!sandboxConfiguration) {
        context.addIssue({
          code: "custom",
          path: ["pravaBaseUrl"],
          message:
            "Fitora currently requires matching Prava sandbox API, hosted-checkout, and sk_test key configuration.",
        });
      }
    }

    if (
      securePublicOriginsRequired &&
      !environment.appUrl.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["appUrl"],
        message:
          "Production and Prava checkout require an HTTPS application origin.",
      });
    }

    if (
      securePublicOriginsRequired &&
      !environment.merchantUrl.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["merchantUrl"],
        message:
          "Production and Prava checkout require an HTTPS merchant origin.",
      });
    }
  });

export type PaymentProviderName = z.infer<typeof paymentProviderSchema>;
export type RuntimeNodeEnvironment = z.infer<typeof nodeEnvironmentSchema>;

export type ServerEnvironment = Readonly<{
  nodeEnv: RuntimeNodeEnvironment;
  isProduction: boolean;
  paymentProvider: PaymentProviderName;
  appUrl: string;
  checkoutSigningSecret: string;
  usesDevelopmentSigningSecret: boolean;
  prava: Readonly<{
    baseUrl: string;
    hostedCheckoutOrigin?: string;
    secretKey?: string;
    ready: boolean;
  }>;
  merchant: Readonly<{
    name: string;
    url: string;
    countryCode: string;
    forceDecline: boolean;
  }>;
}>;

export type EnvironmentValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ServerEnvironmentParseResult =
  | Readonly<{ success: true; config: ServerEnvironment }>
  | Readonly<{
      success: false;
      issues: readonly EnvironmentValidationIssue[];
    }>;

export class ServerEnvironmentConfigurationError extends Error {
  readonly issues: readonly EnvironmentValidationIssue[];

  constructor(issues: readonly EnvironmentValidationIssue[]) {
    super("Fitora server environment configuration is invalid.");
    this.name = "ServerEnvironmentConfigurationError";
    this.issues = issues;
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function optionalNonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

export function parseServerEnvironment(
  source: EnvironmentSource = process.env,
): ServerEnvironmentParseResult {
  const nodeEnv = source.NODE_ENV ?? "development";
  const localDefaultsAllowed = nodeEnv !== "production";
  const appUrl =
    source.NEXT_PUBLIC_APP_URL ??
    (localDefaultsAllowed ? LOCAL_APP_ORIGIN : undefined);

  const result = rawServerEnvironmentSchema.safeParse({
    nodeEnv,
    paymentProvider: source.PAYMENT_PROVIDER ?? "mock",
    appUrl,
    checkoutSigningSecret: optionalNonEmpty(source.CHECKOUT_SIGNING_SECRET),
    pravaSecretKey: optionalNonEmpty(source.PRAVA_SECRET_KEY),
    pravaBaseUrl: source.PRAVA_BASE_URL ?? DEFAULT_PRAVA_ORIGIN,
    pravaHostedCheckoutOrigin:
      source.PRAVA_HOSTED_CHECKOUT_ORIGIN ??
      DEFAULT_PRAVA_HOSTED_CHECKOUT_ORIGIN,
    merchantName: source.DEMO_MERCHANT_NAME ?? DEFAULT_MERCHANT_NAME,
    merchantUrl: source.DEMO_MERCHANT_URL ?? appUrl,
    merchantCountryCode:
      source.DEMO_MERCHANT_COUNTRY_CODE ?? DEFAULT_MERCHANT_COUNTRY_CODE,
    forceMerchantDecline: source.DEMO_MERCHANT_FORCE_DECLINE ?? "false",
  });

  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const usesDevelopmentSigningSecret =
    result.data.checkoutSigningSecret === undefined;
  const pravaReady = Boolean(result.data.pravaSecretKey);

  return {
    success: true,
    config: {
      nodeEnv: result.data.nodeEnv,
      isProduction: result.data.nodeEnv === "production",
      paymentProvider: result.data.paymentProvider,
      appUrl: result.data.appUrl,
      checkoutSigningSecret:
        result.data.checkoutSigningSecret ??
        DEVELOPMENT_MOCK_ONLY_SIGNING_SECRET,
      usesDevelopmentSigningSecret,
      prava: {
        baseUrl: result.data.pravaBaseUrl,
        ...(result.data.pravaHostedCheckoutOrigin
          ? {
              hostedCheckoutOrigin:
                result.data.pravaHostedCheckoutOrigin,
            }
          : {}),
        ...(result.data.pravaSecretKey
          ? { secretKey: result.data.pravaSecretKey }
          : {}),
        ready: pravaReady,
      },
      merchant: {
        name: result.data.merchantName,
        url: result.data.merchantUrl,
        countryCode: result.data.merchantCountryCode,
        forceDecline: result.data.forceMerchantDecline,
      },
    },
  };
}

export function getServerEnvironment(
  source: EnvironmentSource = process.env,
): ServerEnvironment {
  const result = parseServerEnvironment(source);

  if (!result.success) {
    throw new ServerEnvironmentConfigurationError(result.issues);
  }

  return result.config;
}
