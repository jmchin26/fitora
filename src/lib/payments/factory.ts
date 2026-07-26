import {
  createDemoMerchant,
  type DemoMerchantAdapter,
} from "@/lib/merchant/demo-merchant";
import {
  getServerEnvironment,
  type ServerEnvironment,
} from "@/lib/config/env";
import {
  createMockPaymentProvider,
  type MockPaymentProviderOptions,
} from "@/lib/payments/mock";
import {
  createPravaClient,
  type PravaClient,
} from "@/lib/payments/prava";
import { createPravaPaymentProvider } from "@/lib/payments/prava-provider";
import {
  PAYMENT_PROVIDER_NAMES,
  PaymentProviderError,
  type PaymentProvider,
  type PaymentProviderName,
} from "@/lib/payments/types";

type PaymentProviderEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type PaymentProviderFactoryOptions = {
  provider?: string;
  environment?: PaymentProviderEnvironment;
  serverEnvironment?: ServerEnvironment;
  appUrl?: string;
  forceMerchantDecline?: boolean;
  merchant?: DemoMerchantAdapter;
  now?: MockPaymentProviderOptions["now"];
  randomUUID?: MockPaymentProviderOptions["randomUUID"];
  expiresInMs?: number;
  pravaClient?: PravaClient;
};

export type PaymentProviderResolution =
  | {
      status: "ready";
      configured: PaymentProviderName;
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

  try {
    const serverEnvironment =
      options.serverEnvironment ??
      getServerEnvironment({
        ...environment,
        PAYMENT_PROVIDER: configured,
        ...(options.appUrl
          ? { NEXT_PUBLIC_APP_URL: options.appUrl }
          : {}),
        ...(options.forceMerchantDecline === undefined
          ? {}
          : {
              DEMO_MERCHANT_FORCE_DECLINE: String(
                options.forceMerchantDecline,
              ),
            }),
      });

    if (serverEnvironment.paymentProvider !== configured) {
      throw new PaymentProviderError(
        configured,
        "INVALID_CONFIGURATION",
        "The payment provider configuration does not match.",
      );
    }

    if (configured === "prava") {
      if (!serverEnvironment.prava.secretKey) {
        throw new PaymentProviderError(
          configured,
          "INVALID_CONFIGURATION",
          "The Prava server configuration is incomplete.",
        );
      }

      const client =
        options.pravaClient ??
        createPravaClient({
          baseUrl: serverEnvironment.prava.baseUrl,
          secretKey: serverEnvironment.prava.secretKey,
          userIdSigningSecret:
            serverEnvironment.checkoutSigningSecret,
          merchant: {
            name: serverEnvironment.merchant.name,
            url: serverEnvironment.merchant.url,
            countryCode: serverEnvironment.merchant.countryCode,
          },
        });

      return {
        status: "ready",
        configured,
        provider: createPravaPaymentProvider({ client }),
      };
    }

    const forceDecline =
      options.forceMerchantDecline ??
      parseForceDecline(
        String(serverEnvironment.merchant.forceDecline),
      );
    const merchant =
      options.merchant ?? createDemoMerchant({ forceDecline });
    const provider = createMockPaymentProvider({
      appUrl:
        options.appUrl ??
        serverEnvironment.appUrl,
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
        : "The payment provider configuration is invalid.",
    );
  }
}

export const createPaymentProvider = resolvePaymentProvider;
