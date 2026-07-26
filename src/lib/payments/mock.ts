import { randomUUID as generateRandomUuid } from "node:crypto";

import {
  createDemoMerchant,
  DemoMerchantResultSchema,
  type DemoMerchantAdapter,
} from "@/lib/merchant/demo-merchant";
import {
  PaymentProviderError,
  parseCreatePaymentSessionInput,
  parseFinalizePaymentInput,
  parseHostedSession,
  parsePaymentResult,
  throwIfPaymentAborted,
  type CreatePaymentSessionInput,
  type FinalizePaymentInput,
  type HostedSession,
  type PaymentProvider,
  type PaymentResult,
} from "@/lib/payments/types";

const DEFAULT_EXPIRY_MS = 5 * 60 * 1_000;
const MINIMUM_EXPIRY_MS = 1_000;
const MAXIMUM_EXPIRY_MS = 15 * 60 * 1_000;

export type MockPaymentProviderOptions = {
  appUrl: string;
  merchant?: DemoMerchantAdapter;
  now?: () => Date;
  randomUUID?: () => string;
  expiresInMs?: number;
};

function configurationError(message: string): PaymentProviderError {
  return new PaymentProviderError("mock", "INVALID_CONFIGURATION", message);
}

function parseAppOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw configurationError("NEXT_PUBLIC_APP_URL must be a valid app origin.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw configurationError(
      "NEXT_PUBLIC_APP_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.",
    );
  }

  return url.origin;
}

function parseExpiry(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MINIMUM_EXPIRY_MS ||
    value > MAXIMUM_EXPIRY_MS
  ) {
    throw configurationError(
      "Mock payment expiry must be between 1 second and 15 minutes.",
    );
  }

  return value;
}

function safeNow(now: () => Date): Date {
  const value = now();

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new PaymentProviderError(
      "mock",
      "INVALID_OUTPUT",
      "The mock payment clock returned an invalid time.",
    );
  }

  return value;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  private readonly appOrigin: string;
  private readonly merchant: DemoMerchantAdapter;
  private readonly now: () => Date;
  private readonly randomUUID: () => string;
  private readonly expiresInMs: number;

  constructor(options: MockPaymentProviderOptions) {
    this.appOrigin = parseAppOrigin(options.appUrl);
    this.merchant = options.merchant ?? createDemoMerchant();
    this.now = options.now ?? (() => new Date());
    this.randomUUID = options.randomUUID ?? generateRandomUuid;
    this.expiresInMs = parseExpiry(options.expiresInMs ?? DEFAULT_EXPIRY_MS);
  }

  async createSession(
    input: CreatePaymentSessionInput,
    signal: AbortSignal,
  ): Promise<HostedSession> {
    throwIfPaymentAborted(this.name, signal);
    const parsed = parseCreatePaymentSessionInput(this.name, input);
    const callback = new URL(parsed.callbackUrl);

    if (
      callback.origin !== this.appOrigin ||
      callback.username.length > 0 ||
      callback.password.length > 0
    ) {
      throw new PaymentProviderError(
        this.name,
        "INVALID_INPUT",
        "The payment callback must use the configured Fitora app origin.",
      );
    }

    const sessionId = this.randomUUID();
    const now = safeNow(this.now);
    const hostedUrl = new URL("/checkout/mock", this.appOrigin);
    hostedUrl.searchParams.set("sessionId", sessionId);

    throwIfPaymentAborted(this.name, signal);

    return parseHostedSession(this.name, {
      provider: this.name,
      sessionId,
      hostedUrl: hostedUrl.toString(),
      expiresAt: new Date(now.getTime() + this.expiresInMs).toISOString(),
    });
  }

  async finalize(
    input: FinalizePaymentInput,
    signal: AbortSignal,
  ): Promise<PaymentResult> {
    throwIfPaymentAborted(this.name, signal);
    const parsed = parseFinalizePaymentInput(this.name, input);

    if (parsed.decision === "pending") {
      return parsePaymentResult(this.name, {
        provider: this.name,
        sessionId: parsed.sessionId,
        status: "pending",
        retryable: true,
      });
    }

    if (parsed.decision === "decline") {
      return parsePaymentResult(this.name, {
        provider: this.name,
        sessionId: parsed.sessionId,
        status: "declined",
        reasonCode: "CUSTOMER_DECLINED",
      });
    }

    let merchantOutput: unknown;

    try {
      merchantOutput = await this.merchant.checkout(
        {
          order: parsed.order,
          sessionId: parsed.sessionId,
          context: {
            merchantId: parsed.order.merchantId,
            currency: parsed.order.currency,
            totalCents: parsed.order.totalCents,
          },
        },
        signal,
      );
    } catch {
      if (signal.aborted) {
        throw new PaymentProviderError(
          this.name,
          "ABORTED",
          "The mock payment request was cancelled.",
        );
      }

      throw new PaymentProviderError(
        this.name,
        "INVALID_OUTPUT",
        "The demo merchant returned an invalid result.",
      );
    }

    throwIfPaymentAborted(this.name, signal);

    const parsedMerchantResult =
      DemoMerchantResultSchema.safeParse(merchantOutput);

    if (!parsedMerchantResult.success) {
      throw new PaymentProviderError(
        this.name,
        "INVALID_OUTPUT",
        "The demo merchant returned an invalid result.",
      );
    }

    const merchantResult = parsedMerchantResult.data;

    if (merchantResult.status === "declined") {
      return parsePaymentResult(this.name, {
        provider: this.name,
        sessionId: parsed.sessionId,
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      });
    }

    return parsePaymentResult(this.name, {
      provider: this.name,
      sessionId: parsed.sessionId,
      status: "approved",
      orderReference: merchantResult.orderReference,
    });
  }
}

export function createMockPaymentProvider(
  options: MockPaymentProviderOptions,
): PaymentProvider {
  return new MockPaymentProvider(options);
}
