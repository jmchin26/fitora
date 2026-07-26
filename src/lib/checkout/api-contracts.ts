import { z } from "zod";

import { OutfitReferenceSchema } from "@/lib/catalogue/schemas";
import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";

export const CheckoutReviewRequestSchema = z
  .object({
    outfit: OutfitReferenceSchema,
  })
  .strict();

export const CheckoutApprovalRequestSchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    attemptId: CheckoutAttemptIdSchema,
    reviewId: z.string().uuid(),
  })
  .strict();

export const MockFinalizeRequestSchema = z
  .object({
    decision: z.enum(["approve", "decline"]),
  })
  .strict();

export const CheckoutReviewStartedSchema = z
  .object({
    ok: z.literal(true),
    reviewUrl: z.literal("/checkout/review"),
  })
  .strict();

const SafeHttpsHostedUrlSchema = z.string().trim().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}, "Hosted checkout URL must be a safe HTTPS URL.");

export const CheckoutSessionStartedSchema = z.discriminatedUnion(
  "provider",
  [
    z
      .object({
        ok: z.literal(true),
        provider: z.literal("mock"),
        hostedUrl: z.literal("/checkout/mock"),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    z
      .object({
        ok: z.literal(true),
        provider: z.literal("prava"),
        hostedUrl: SafeHttpsHostedUrlSchema,
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
  ],
);

export const CheckoutFinalizedSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum([
      "pending",
      "approved",
      "declined",
      "expired",
      "reconciliation_required",
      "mock_success",
    ]),
    redirectUrl: z.literal("/checkout/result"),
  })
  .strict();

export const CHECKOUT_API_ERROR_CODES = [
  "INVALID_JSON",
  "INVALID_CHECKOUT_REQUEST",
  "INVALID_CONTENT_TYPE",
  "INVALID_REQUEST_ORIGIN",
  "CHECKOUT_STATE_MISSING",
  "CHECKOUT_STATE_INVALID",
  "CHECKOUT_STATE_EXPIRED",
  "CHECKOUT_PRICE_CHANGED",
  "CHECKOUT_ORDER_UNAVAILABLE",
  "CHECKOUT_CONFIGURATION_INVALID",
  "PAYMENT_PROVIDER_UNAVAILABLE",
  "PAYMENT_ATTEMPT_LIMIT_REACHED",
  "PAYMENT_SESSION_ACTIVE",
  "PAYMENT_FINALIZE_NOT_ALLOWED",
  "PAYMENT_SESSION_FAILED",
  "PAYMENT_SESSION_UNCERTAIN",
  "PAYMENT_FINALIZE_FAILED",
] as const;

export const CheckoutApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum(CHECKOUT_API_ERROR_CODES),
        message: z.string().trim().min(1).max(240),
        fields: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict(),
  })
  .strict();

export type CheckoutReviewRequest = z.infer<
  typeof CheckoutReviewRequestSchema
>;
export type CheckoutApprovalRequest = z.infer<
  typeof CheckoutApprovalRequestSchema
>;
export type MockFinalizeRequest = z.infer<
  typeof MockFinalizeRequestSchema
>;
export type CheckoutReviewStarted = z.infer<
  typeof CheckoutReviewStartedSchema
>;
export type CheckoutSessionStarted = z.infer<
  typeof CheckoutSessionStartedSchema
>;
export type CheckoutFinalized = z.infer<typeof CheckoutFinalizedSchema>;
export type CheckoutApiError = z.infer<typeof CheckoutApiErrorSchema>;
