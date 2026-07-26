import { createHash } from "node:crypto";

import { z } from "zod";

import { VerifiedOrderSchema } from "@/lib/checkout/order";
import { PaymentSessionIdSchema } from "@/lib/payments/types";

export const DemoMerchantConfigSchema = z
  .object({
    merchantId: z.literal("fitora-demo").default("fitora-demo"),
    currency: z.literal("USD").default("USD"),
    forceDecline: z.boolean().default(false),
  })
  .strict();

export const DemoMerchantPurchaseContextSchema = z
  .object({
    merchantId: z.literal("fitora-demo"),
    currency: z.literal("USD"),
    totalCents: z.number().int().positive(),
  })
  .strict();

export const DemoMerchantCheckoutInputSchema = z
  .object({
    order: VerifiedOrderSchema,
    sessionId: PaymentSessionIdSchema,
    context: DemoMerchantPurchaseContextSchema,
  })
  .strict();

export const DemoMerchantResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("accepted"),
      orderReference: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .regex(/^[A-Z0-9-]+$/),
    })
    .strict(),
  z
    .object({
      status: z.literal("declined"),
      reasonCode: z.enum(["CONTEXT_MISMATCH", "FORCED_DECLINE"]),
    })
    .strict(),
]);

export type DemoMerchantConfig = z.input<typeof DemoMerchantConfigSchema>;
export type DemoMerchantCheckoutInput = z.input<
  typeof DemoMerchantCheckoutInputSchema
>;
export type DemoMerchantResult = z.infer<typeof DemoMerchantResultSchema>;

export interface DemoMerchantAdapter {
  checkout(
    input: DemoMerchantCheckoutInput,
    signal: AbortSignal,
  ): Promise<DemoMerchantResult>;
}

function orderReferenceForSession(sessionId: string): string {
  const digest = createHash("sha256")
    .update(`fitora-demo:${sessionId}`, "utf8")
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  return `FITORA-${digest}`;
}

export class DemoMerchant implements DemoMerchantAdapter {
  private readonly config: z.output<typeof DemoMerchantConfigSchema>;

  constructor(config: DemoMerchantConfig = {}) {
    const parsed = DemoMerchantConfigSchema.safeParse(config);

    if (!parsed.success) {
      throw new Error("The demo merchant configuration is invalid.");
    }

    this.config = parsed.data;
  }

  async checkout(
    input: DemoMerchantCheckoutInput,
    signal: AbortSignal,
  ): Promise<DemoMerchantResult> {
    if (signal.aborted) {
      throw new DOMException("The demo merchant request was cancelled.", "AbortError");
    }

    const parsed = DemoMerchantCheckoutInputSchema.safeParse(input);

    if (!parsed.success) {
      return {
        status: "declined",
        reasonCode: "CONTEXT_MISMATCH",
      };
    }

    const { context, order, sessionId } = parsed.data;
    const contextMatches =
      context.merchantId === this.config.merchantId &&
      context.currency === this.config.currency &&
      context.merchantId === order.merchantId &&
      context.currency === order.currency &&
      context.totalCents === order.totalCents;

    if (!contextMatches) {
      return {
        status: "declined",
        reasonCode: "CONTEXT_MISMATCH",
      };
    }

    if (this.config.forceDecline) {
      return {
        status: "declined",
        reasonCode: "FORCED_DECLINE",
      };
    }

    return DemoMerchantResultSchema.parse({
      status: "accepted",
      orderReference: orderReferenceForSession(sessionId),
    });
  }
}

export function createDemoMerchant(
  config: DemoMerchantConfig = {},
): DemoMerchantAdapter {
  return new DemoMerchant(config);
}
