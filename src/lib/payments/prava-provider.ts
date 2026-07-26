import type { PravaClient } from "@/lib/payments/prava";
import {
  PaymentProviderError,
  parseCreatePaymentSessionInput,
  parseHostedSession,
  throwIfPaymentAborted,
  type CreatePaymentSessionInput,
  type FinalizePaymentInput,
  type HostedSession,
  type PaymentProvider,
  type PaymentResult,
} from "@/lib/payments/types";

export type PravaPaymentProviderOptions = Readonly<{
  client: PravaClient;
}>;

/**
 * Hosted-session adapter for the shared checkout boundary. Real payment
 * finalization is callback-driven and intentionally cannot be controlled by
 * the public mock-finalize endpoint.
 */
export class PravaPaymentProvider implements PaymentProvider {
  readonly name = "prava" as const;
  private readonly client: PravaClient;

  constructor(options: PravaPaymentProviderOptions) {
    if (!options.client || typeof options.client.createSession !== "function") {
      throw new PaymentProviderError(
        this.name,
        "INVALID_CONFIGURATION",
        "The Prava payment client is unavailable.",
      );
    }

    this.client = options.client;
  }

  async createSession(
    input: CreatePaymentSessionInput,
    signal: AbortSignal,
  ): Promise<HostedSession> {
    throwIfPaymentAborted(this.name, signal);
    const parsed = parseCreatePaymentSessionInput(this.name, input);
    const session = await this.client.createSession(parsed, signal);
    throwIfPaymentAborted(this.name, signal);

    return parseHostedSession(this.name, {
      provider: this.name,
      sessionId: session.sessionId,
      hostedUrl: session.hostedUrl,
      expiresAt: session.expiresAt,
    });
  }

  async finalize(
    input: FinalizePaymentInput,
    signal: AbortSignal,
  ): Promise<PaymentResult> {
    void input;
    void signal;
    throw new PaymentProviderError(
      this.name,
      "NOT_IMPLEMENTED",
      "Prava payment results are finalized only by the server callback.",
    );
  }
}

export function createPravaPaymentProvider(
  options: PravaPaymentProviderOptions,
): PaymentProvider {
  return new PravaPaymentProvider(options);
}
