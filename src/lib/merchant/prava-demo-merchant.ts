import { createHash } from "node:crypto";

import { z } from "zod";

import {
  CHECKOUT_CURRENCY,
  CHECKOUT_MERCHANT_ID,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import { PaymentSessionIdSchema } from "@/lib/payments/types";

/**
 * A canonical, server-only representation of the short-lived credentials
 * returned by Prava. Callers must bridge the provider payload into this shape
 * and discard it immediately after checkout.
 */
export const PravaOneTimeCredentialsSchema = z
  .object({
    token: z.string().min(1).max(2_048),
    dynamicCvv: z.string().min(1).max(64),
    expiryMonth: z.number().int().min(1).max(12),
    expiryYear: z.number().int().min(2_000).max(9_999),
  })
  .strict();

export const PravaDemoMerchantContextSchema = z
  .object({
    merchantId: z.literal(CHECKOUT_MERCHANT_ID),
    currency: z.literal(CHECKOUT_CURRENCY),
    totalCents: z.number().int().positive(),
  })
  .strict();

export const PravaDemoMerchantCheckoutInputSchema = z
  .object({
    order: VerifiedOrderSchema,
    sessionId: PaymentSessionIdSchema,
    /** The Prava `txn_ref_id`, normalized by the provider boundary. */
    txnRefId: z.string().trim().min(1).max(256),
    credentials: PravaOneTimeCredentialsSchema,
    context: PravaDemoMerchantContextSchema,
  })
  .strict();

export const PRAVA_DEMO_MERCHANT_DECLINE_REASONS = [
  "INVALID_INPUT",
  "INVALID_CREDENTIAL",
  "CONTEXT_MISMATCH",
  "FORCED_DECLINE",
] as const;

const PravaDeclineReasonSchema = z.enum(
  PRAVA_DEMO_MERCHANT_DECLINE_REASONS,
);

const PravaReportBaseSchema = z
  .object({
    authorizationCode: z.string().regex(/^[A-Z0-9]{6}$/),
    responseCode: z.string().regex(/^\d{2}$/),
  })
  .strict();

export const PravaDemoMerchantResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("approved"),
      orderReference: z
        .string()
        .min(1)
        .max(80)
        .regex(/^[A-Z0-9-]+$/),
      reportStatus: z.literal("APPROVED"),
      authorizationCode: PravaReportBaseSchema.shape.authorizationCode,
      responseCode: z.literal("00"),
    })
    .strict(),
  z
    .object({
      status: z.literal("declined"),
      reasonCode: PravaDeclineReasonSchema,
      reportStatus: z.literal("DECLINED"),
      authorizationCode: z.literal("000000"),
      responseCode: z.enum(["05", "13", "14", "30"]),
    })
    .strict(),
]);

export type PravaOneTimeCredentials = z.infer<
  typeof PravaOneTimeCredentialsSchema
>;
export type PravaDemoMerchantCheckoutInput = z.input<
  typeof PravaDemoMerchantCheckoutInputSchema
>;
export type PravaDemoMerchantResult = z.infer<
  typeof PravaDemoMerchantResultSchema
>;

export type PravaDemoMerchantOptions = Readonly<{
  /** Server-only test switch. It must never be derived from a browser request. */
  forceDecline?: boolean;
  now?: () => Date;
}>;

export interface PravaDemoMerchantAdapter {
  checkout(
    input: PravaDemoMerchantCheckoutInput,
    signal: AbortSignal,
  ): Promise<PravaDemoMerchantResult>;
}

const DECLINED_AUTHORIZATION_CODE = "000000" as const;

const DECLINE_RESPONSE_CODES = {
  INVALID_INPUT: "30",
  INVALID_CREDENTIAL: "14",
  CONTEXT_MISMATCH: "13",
  FORCED_DECLINE: "05",
} as const satisfies Record<
  z.infer<typeof PravaDeclineReasonSchema>,
  "05" | "13" | "14" | "30"
>;

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException(
      "The Prava demo merchant request was cancelled.",
      "AbortError",
    );
  }
}

function decline(
  reasonCode: z.infer<typeof PravaDeclineReasonSchema>,
): PravaDemoMerchantResult {
  return PravaDemoMerchantResultSchema.parse({
    status: "declined",
    reasonCode,
    reportStatus: "DECLINED",
    authorizationCode: DECLINED_AUTHORIZATION_CODE,
    responseCode: DECLINE_RESPONSE_CODES[reasonCode],
  });
}

function stableMerchantDigest(
  scope: "order" | "authorization",
  reference: string,
  order: VerifiedOrder,
): string {
  const productIds = order.items.map((item) => item.productId).join(":");

  return createHash("sha256")
    .update(
      `fitora-prava-demo:v1:${scope}:${reference}:${order.merchantId}:${order.currency}:${order.totalCents}:${productIds}`,
      "utf8",
    )
    .digest("hex")
    .toUpperCase();
}

/**
 * Produces the same safe reference during the initial checkout and a later
 * idempotent recovery after Prava has already reached `completed`.
 */
export function pravaDemoOrderReferenceForSession(
  sessionId: string,
  order: VerifiedOrder,
): string {
  const parsedSessionId = PaymentSessionIdSchema.safeParse(sessionId);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (!parsedSessionId.success || !parsedOrder.success) {
    throw new Error("The Prava demo order reference input is invalid.");
  }

  const digest = stableMerchantDigest(
    "order",
    parsedSessionId.data,
    parsedOrder.data,
  );

  return `FITORA-PRAVA-${digest.slice(0, 16)}`;
}

export function pravaDemoAuthorizationCodeForTransaction(
  transactionReferenceId: string,
  order: VerifiedOrder,
): string {
  const parsedTransactionReferenceId = z
    .string()
    .trim()
    .min(1)
    .max(256)
    .safeParse(transactionReferenceId);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (!parsedTransactionReferenceId.success || !parsedOrder.success) {
    throw new Error("The Prava demo authorization input is invalid.");
  }

  return stableMerchantDigest(
    "authorization",
    parsedTransactionReferenceId.data,
    parsedOrder.data,
  ).slice(0, 6);
}

function credentialsAreExpired(
  credentials: PravaOneTimeCredentials,
  now: Date,
): boolean {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  return (
    credentials.expiryYear < currentYear ||
    (credentials.expiryYear === currentYear &&
      credentials.expiryMonth < currentMonth)
  );
}

/**
 * Sandbox merchant simulation for the Prava path. The adapter deliberately
 * retains only non-sensitive configuration; credential material is parsed and
 * inspected in the checkout stack frame and is absent from every result.
 */
export class PravaDemoMerchant implements PravaDemoMerchantAdapter {
  private readonly forceDecline: boolean;
  private readonly now: () => Date;

  constructor(options: PravaDemoMerchantOptions = {}) {
    if (
      (options.forceDecline !== undefined &&
        typeof options.forceDecline !== "boolean") ||
      (options.now !== undefined && typeof options.now !== "function")
    ) {
      throw new Error("The Prava demo merchant configuration is invalid.");
    }

    this.forceDecline = options.forceDecline ?? false;
    this.now = options.now ?? (() => new Date());
  }

  async checkout(
    input: PravaDemoMerchantCheckoutInput,
    signal: AbortSignal,
  ): Promise<PravaDemoMerchantResult> {
    abortIfRequested(signal);

    const parsed = PravaDemoMerchantCheckoutInputSchema.safeParse(input);

    if (!parsed.success) {
      return decline("INVALID_INPUT");
    }

    const { context, credentials, order, sessionId, txnRefId } =
      parsed.data;
    const contextMatches =
      context.merchantId === CHECKOUT_MERCHANT_ID &&
      context.currency === CHECKOUT_CURRENCY &&
      context.merchantId === order.merchantId &&
      context.currency === order.currency &&
      context.totalCents === order.totalCents;

    if (!contextMatches) {
      return decline("CONTEXT_MISMATCH");
    }

    const now = this.now();

    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error("The Prava demo merchant clock is invalid.");
    }

    if (credentialsAreExpired(credentials, now)) {
      return decline("INVALID_CREDENTIAL");
    }

    abortIfRequested(signal);

    if (this.forceDecline) {
      return decline("FORCED_DECLINE");
    }

    return PravaDemoMerchantResultSchema.parse({
      status: "approved",
      orderReference: pravaDemoOrderReferenceForSession(sessionId, order),
      reportStatus: "APPROVED",
      authorizationCode:
        pravaDemoAuthorizationCodeForTransaction(txnRefId, order),
      responseCode: "00",
    });
  }
}

export function createPravaDemoMerchant(
  options: PravaDemoMerchantOptions = {},
): PravaDemoMerchantAdapter {
  return new PravaDemoMerchant(options);
}
