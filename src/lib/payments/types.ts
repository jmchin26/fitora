import { z } from "zod";

import {
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";

export const PAYMENT_PROVIDER_NAMES = ["mock", "prava"] as const;
export const PAYMENT_DECISIONS = ["approve", "decline", "pending"] as const;
export const PAYMENT_RESULT_STATUSES = [
  "approved",
  "declined",
  "pending",
] as const;

export const PaymentProviderNameSchema = z.enum(PAYMENT_PROVIDER_NAMES);
export const PaymentDecisionSchema = z.enum(PAYMENT_DECISIONS);
export const PaymentResultStatusSchema = z.enum(PAYMENT_RESULT_STATUSES);

export const PaymentSessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const CreatePaymentSessionInputSchema = z
  .object({
    order: VerifiedOrderSchema,
    email: z.string().trim().email().max(254),
    callbackUrl: z.string().trim().url().max(2_048),
  })
  .strict();

export const FinalizePaymentInputSchema = z
  .object({
    order: VerifiedOrderSchema,
    sessionId: PaymentSessionIdSchema,
    decision: PaymentDecisionSchema,
  })
  .strict();

export const HostedSessionSchema = z
  .object({
    provider: PaymentProviderNameSchema,
    sessionId: PaymentSessionIdSchema,
    hostedUrl: z.string().trim().url().max(2_048),
    expiresAt: z.iso.datetime(),
  })
  .strict();

const ApprovedPaymentResultSchema = z
  .object({
    provider: PaymentProviderNameSchema,
    sessionId: PaymentSessionIdSchema,
    status: z.literal("approved"),
    orderReference: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9-]+$/),
  })
  .strict();

const DeclinedPaymentResultSchema = z
  .object({
    provider: PaymentProviderNameSchema,
    sessionId: PaymentSessionIdSchema,
    status: z.literal("declined"),
    reasonCode: z.enum([
      "CUSTOMER_DECLINED",
      "MERCHANT_DECLINED",
      "PROVIDER_DECLINED",
    ]),
  })
  .strict();

const PendingPaymentResultSchema = z
  .object({
    provider: PaymentProviderNameSchema,
    sessionId: PaymentSessionIdSchema,
    status: z.literal("pending"),
    retryable: z.literal(true),
  })
  .strict();

export const PaymentResultSchema = z.discriminatedUnion("status", [
  ApprovedPaymentResultSchema,
  DeclinedPaymentResultSchema,
  PendingPaymentResultSchema,
]);

export const PAYMENT_PROVIDER_FAILURE_REASONS = [
  "INVALID_CONFIGURATION",
  "INVALID_INPUT",
  "INVALID_OUTPUT",
  "NOT_IMPLEMENTED",
  "ABORTED",
] as const;

export type PaymentProviderName = z.infer<typeof PaymentProviderNameSchema>;
export type PaymentDecision = z.infer<typeof PaymentDecisionSchema>;
export type PaymentResultStatus = z.infer<typeof PaymentResultStatusSchema>;
export type CreatePaymentSessionInput = z.input<
  typeof CreatePaymentSessionInputSchema
>;
export type ParsedCreatePaymentSessionInput = z.output<
  typeof CreatePaymentSessionInputSchema
>;
export type FinalizePaymentInput = z.input<typeof FinalizePaymentInputSchema>;
export type ParsedFinalizePaymentInput = z.output<
  typeof FinalizePaymentInputSchema
>;
export type HostedSession = z.infer<typeof HostedSessionSchema>;
export type PaymentResult = z.infer<typeof PaymentResultSchema>;
export type PaymentProviderFailureReason =
  (typeof PAYMENT_PROVIDER_FAILURE_REASONS)[number];

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createSession(
    input: {
      order: VerifiedOrder;
      email: string;
      callbackUrl: string;
    },
    signal: AbortSignal,
  ): Promise<HostedSession>;
  finalize(
    input: {
      order: VerifiedOrder;
      sessionId: string;
      decision: PaymentDecision;
    },
    signal: AbortSignal,
  ): Promise<PaymentResult>;
}

export class PaymentProviderError extends Error {
  readonly provider: PaymentProviderName;
  readonly reason: PaymentProviderFailureReason;

  constructor(
    provider: PaymentProviderName,
    reason: PaymentProviderFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "PaymentProviderError";
    this.provider = provider;
    this.reason = reason;
  }
}

export function parseCreatePaymentSessionInput(
  provider: PaymentProviderName,
  input: CreatePaymentSessionInput,
): ParsedCreatePaymentSessionInput {
  const parsed = CreatePaymentSessionInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new PaymentProviderError(
      provider,
      "INVALID_INPUT",
      "The payment session request is invalid.",
    );
  }

  return parsed.data;
}

export function parseFinalizePaymentInput(
  provider: PaymentProviderName,
  input: FinalizePaymentInput,
): ParsedFinalizePaymentInput {
  const parsed = FinalizePaymentInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new PaymentProviderError(
      provider,
      "INVALID_INPUT",
      "The payment finalization request is invalid.",
    );
  }

  return parsed.data;
}

export function parseHostedSession(
  provider: PaymentProviderName,
  output: unknown,
): HostedSession {
  const parsed = HostedSessionSchema.safeParse(output);

  if (!parsed.success || parsed.data.provider !== provider) {
    throw new PaymentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The payment provider returned an invalid hosted session.",
    );
  }

  return parsed.data;
}

export function parsePaymentResult(
  provider: PaymentProviderName,
  output: unknown,
): PaymentResult {
  const parsed = PaymentResultSchema.safeParse(output);

  if (!parsed.success || parsed.data.provider !== provider) {
    throw new PaymentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The payment provider returned an invalid result.",
    );
  }

  return parsed.data;
}

export function throwIfPaymentAborted(
  provider: PaymentProviderName,
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    throw new PaymentProviderError(
      provider,
      "ABORTED",
      `The ${provider} payment request was cancelled.`,
    );
  }
}
