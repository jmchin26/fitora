import {
  createDemoMerchant,
  type DemoMerchantAdapter,
} from "@/lib/merchant/demo-merchant";
import {
  createMockPaymentProvider,
  type MockPaymentProviderOptions,
} from "@/lib/payments/mock";
import {
  PAYMENT_PROVIDER_NAMES,
  PaymentProviderError,
  type PaymentProvider,
  type PaymentProviderName,
} from "@/lib/payments/types";

type PaymentProviderEnvironment = Readonly<{
  PAYMENT_PROVIDER?: string;
  NEXT_PUBLIC_APP_URL?: string;
  DEMO_MERCHANT_FORCE_DECLINE?: string;
}>;

export type PaymentProviderFactoryOptions = {
  provider?: string;
  environment?: PaymentProviderEnvironment;
  appUrl?: string;
  forceMerchantDecline?: boolean;
  merchant?: DemoMerchantAdapter;
  now?: MockPaymentProviderOptions["now"];
  randomUUID?: MockPaymentProviderOptions["randomUUID"];
  expiresInMs?: number;
};

export type PaymentProviderResolution =
  | {
      status: "ready";
      configured: "mock";
      provider: PaymentProvider;
    }
  | {
      status: "unavailable";
      configured: "prava";
      reason: "NOT_IMPLEMENTED";
      message: string;
    }
  | {
      status: "invalid";
      configured: PaymentProviderName | "invalid";
      requested: string;
      reason: "INVALID_CONFIGURATION";
      message: string;
    };

function parseForceDecline(value: string | undefined): boolean {
  if (value === undefined || value.trim().length === 0 || value === "false") {
    return false;
  }

  if (value === "true") {
    return true;
  }

  throw new PaymentProviderError(
    "mock",
    "INVALID_CONFIGURATION",
    "DEMO_MERCHANT_FORCE_DECLINE must be true or false.",
  );
}

function invalidResolution(
  configured: PaymentProviderName | "invalid",
  requested: string,
  message: string,
): PaymentProviderResolution {
  return {
    status: "invalid",
    configured,
    requested,
    reason: "INVALID_CONFIGURATION",
    message,
  };
}

export function resolvePaymentProvider(
  options: PaymentProviderFactoryOptions = {},
): PaymentProviderResolution {
  const environment = options.environment ?? process.env;
  const requested = options.provider ?? environment.PAYMENT_PROVIDER ?? "mock";

  if (
    !PAYMENT_PROVIDER_NAMES.includes(
      requested as (typeof PAYMENT_PROVIDER_NAMES)[number],
    )
  ) {
    return invalidResolution(
      "invalid",
      requested,
      `PAYMENT_PROVIDER must be one of: ${PAYMENT_PROVIDER_NAMES.join(", ")}.`,
    );
  }

  const configured = requested as PaymentProviderName;

  if (configured === "prava") {
    return {
      status: "unavailable",
      configured,
      reason: "NOT_IMPLEMENTED",
      message: "Prava is selected, but its hosted checkout provider is not implemented yet.",
    };
  }

  try {
    const forceDecline =
      options.forceMerchantDecline ??
      parseForceDecline(environment.DEMO_MERCHANT_FORCE_DECLINE);
    const merchant =
      options.merchant ?? createDemoMerchant({ forceDecline });
    const provider = createMockPaymentProvider({
      appUrl:
        options.appUrl ??
        environment.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000",
      merchant,
      now: options.now,
      randomUUID: options.randomUUID,
      expiresInMs: options.expiresInMs,
    });

    return {
      status: "ready",
      configured,
      provider,
    };
  } catch (error) {
    return invalidResolution(
      configured,
      requested,
      error instanceof PaymentProviderError
        ? error.message
        : "The mock payment provider configuration is invalid.",
    );
  }
}

export const createPaymentProvider = resolvePaymentProvider;
