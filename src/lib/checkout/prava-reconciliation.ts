import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  CHECKOUT_CURRENCY,
  CHECKOUT_MERCHANT_ID,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS,
  CHECKOUT_TOKEN_VERSION,
  CheckoutTokenClaimsSchema,
  StrictTokenIssueError,
  compareCheckoutClaimsToOrder,
  signStrictClaims,
  verifyStrictClaims,
  type CheckoutTokenClaims,
  type StrictClaimsVerificationResult,
  type StrictTokenVerificationOptions,
} from "@/lib/checkout/token";
import {
  PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS,
  PaymentSessionTokenClaimsSchema,
  type PaymentSessionTokenClaims,
} from "@/lib/checkout/workflow";

export const PRAVA_RECONCILIATION_TOKEN_TYPE =
  "prava_reconciliation" as const;
export const PRAVA_RECONCILIATION_STAGE =
  "reconciliation_required" as const;
export const PRAVA_RECONCILIATION_TOKEN_DEFAULT_TTL_SECONDS =
  10 * 60;
export const PRAVA_RECONCILIATION_TOKEN_MAX_TTL_SECONDS =
  PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS;

export const PravaReconciliationTokenClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.literal(PRAVA_RECONCILIATION_TOKEN_TYPE),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    checkoutJti: z.string().uuid(),
    paymentAttemptJti: z.string().uuid(),
    provider: z.literal("prava"),
    stage: z.literal(PRAVA_RECONCILIATION_STAGE),
    merchantId: z.literal(CHECKOUT_MERCHANT_ID),
    currency: z.literal(CHECKOUT_CURRENCY),
    totalCents: z.number().int().positive(),
    itemCount: z.literal(3),
  })
  .strict()
  .superRefine((claims, context) => {
    const lifetimeSeconds = claims.exp - claims.iat;

    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds >
        PRAVA_RECONCILIATION_TOKEN_MAX_TTL_SECONDS
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Prava reconciliation state must expire within 20 minutes.",
        path: ["exp"],
      });
    }
  });

export type PravaReconciliationTokenClaims = z.infer<
  typeof PravaReconciliationTokenClaimsSchema
>;

export type IssuePravaReconciliationTokenInput = {
  checkoutClaims: CheckoutTokenClaims;
  sessionClaims: PaymentSessionTokenClaims;
  order: VerifiedOrder;
};

export type IssuePravaReconciliationTokenOptions = {
  nowEpochSeconds?: number;
  jti?: string;
  ttlSeconds?: number;
};

export type VerifyPravaReconciliationTokenOptions = Pick<
  StrictTokenVerificationOptions,
  "nowEpochSeconds" | "futureIatToleranceSeconds" | "maxTokenLength"
>;

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function invalidClaims(message: string): never {
  throw new StrictTokenIssueError("INVALID_CLAIMS", message);
}

export const PRAVA_RECONCILIATION_BINDING_MISMATCH_REASONS = [
  "INVALID_STATE",
  "PROVIDER",
  "CHECKOUT_JTI",
  "PAYMENT_ATTEMPT_JTI",
  "TEMPORAL_BOUNDARY",
  "ORDER",
] as const;

export type PravaReconciliationBindingMismatchReason =
  (typeof PRAVA_RECONCILIATION_BINDING_MISMATCH_REASONS)[number];

export type PravaReconciliationBindingComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "PRAVA_RECONCILIATION_BINDING_MISMATCH";
        reason: PravaReconciliationBindingMismatchReason;
        message: string;
      };
    };

function bindingMismatch(
  reason: PravaReconciliationBindingMismatchReason,
): PravaReconciliationBindingComparisonResult {
  return {
    ok: false,
    error: {
      code: "PRAVA_RECONCILIATION_BINDING_MISMATCH",
      reason,
      message:
        "The Prava reconciliation state does not belong to this reviewed checkout.",
    },
  };
}

/**
 * Confirms that a reconciliation marker belongs to the same canonical order
 * and payment attempt. Provider identifiers are intentionally represented
 * only by the server-issued payment-attempt JTI.
 */
export function comparePravaReconciliationClaimsToCheckout(
  claims: PravaReconciliationTokenClaims,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
): PravaReconciliationBindingComparisonResult {
  const parsedClaims =
    PravaReconciliationTokenClaimsSchema.safeParse(claims);
  const parsedCheckout =
    CheckoutTokenClaimsSchema.safeParse(checkoutClaims);
  const parsedSession =
    PaymentSessionTokenClaimsSchema.safeParse(sessionClaims);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (
    !parsedClaims.success ||
    !parsedCheckout.success ||
    !parsedSession.success ||
    !parsedOrder.success
  ) {
    return bindingMismatch("INVALID_STATE");
  }

  if (parsedSession.data.provider !== "prava") {
    return bindingMismatch("PROVIDER");
  }

  if (
    parsedSession.data.checkoutJti !== parsedCheckout.data.jti ||
    parsedClaims.data.checkoutJti !== parsedCheckout.data.jti
  ) {
    return bindingMismatch("CHECKOUT_JTI");
  }

  if (
    parsedClaims.data.paymentAttemptJti !== parsedSession.data.jti
  ) {
    return bindingMismatch("PAYMENT_ATTEMPT_JTI");
  }

  if (
    parsedClaims.data.iat < parsedCheckout.data.iat ||
    parsedClaims.data.iat < parsedSession.data.iat ||
    parsedClaims.data.exp > parsedCheckout.data.exp ||
    parsedClaims.data.exp > parsedSession.data.exp
  ) {
    return bindingMismatch("TEMPORAL_BOUNDARY");
  }

  const checkoutOrderComparison = compareCheckoutClaimsToOrder(
    parsedCheckout.data,
    parsedOrder.data,
  );

  if (
    !checkoutOrderComparison.ok ||
    parsedClaims.data.merchantId !== parsedOrder.data.merchantId ||
    parsedClaims.data.currency !== parsedOrder.data.currency ||
    parsedClaims.data.totalCents !== parsedOrder.data.totalCents ||
    parsedClaims.data.itemCount !== parsedOrder.data.items.length
  ) {
    return bindingMismatch("ORDER");
  }

  return { ok: true };
}

/**
 * Issues only public-safe evidence that a Prava checkout needs manual
 * reconciliation. Its lifetime cannot outlive the review or payment attempt.
 */
export function issuePravaReconciliationToken(
  input: IssuePravaReconciliationTokenInput,
  secret: string,
  options: IssuePravaReconciliationTokenOptions = {},
): string {
  const checkoutClaims = CheckoutTokenClaimsSchema.safeParse(
    input.checkoutClaims,
  );
  const sessionClaims = PaymentSessionTokenClaimsSchema.safeParse(
    input.sessionClaims,
  );
  const order = VerifiedOrderSchema.safeParse(input.order);
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ??
    PRAVA_RECONCILIATION_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !checkoutClaims.success ||
    !sessionClaims.success ||
    !order.success ||
    !isNonnegativeSafeInteger(nowEpochSeconds) ||
    !isPositiveSafeInteger(ttlSeconds) ||
    ttlSeconds > PRAVA_RECONCILIATION_TOKEN_MAX_TTL_SECONDS
  ) {
    invalidClaims("The Prava reconciliation token claims are invalid.");
  }

  if (
    sessionClaims.data.provider !== "prava" ||
    sessionClaims.data.checkoutJti !== checkoutClaims.data.jti ||
    checkoutClaims.data.iat >
      nowEpochSeconds + CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS ||
    sessionClaims.data.iat >
      nowEpochSeconds + CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS
  ) {
    invalidClaims(
      "The Prava reconciliation state does not match the payment attempt.",
    );
  }

  const exp = Math.min(
    nowEpochSeconds + ttlSeconds,
    checkoutClaims.data.exp,
    sessionClaims.data.exp,
  );

  if (exp <= nowEpochSeconds) {
    invalidClaims(
      "The payment session or reviewed checkout state has expired.",
    );
  }

  const claims: PravaReconciliationTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: PRAVA_RECONCILIATION_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp,
    checkoutJti: checkoutClaims.data.jti,
    paymentAttemptJti: sessionClaims.data.jti,
    provider: "prava",
    stage: PRAVA_RECONCILIATION_STAGE,
    merchantId: order.data.merchantId,
    currency: order.data.currency,
    totalCents: order.data.totalCents,
    itemCount: order.data.items.length,
  };

  const binding = comparePravaReconciliationClaimsToCheckout(
    claims,
    checkoutClaims.data,
    sessionClaims.data,
    order.data,
  );

  if (!binding.ok) {
    invalidClaims("The Prava reconciliation token claims are invalid.");
  }

  return signStrictClaims(
    claims,
    PravaReconciliationTokenClaimsSchema,
    secret,
  );
}

export function verifyPravaReconciliationToken(
  token: unknown,
  secret: string,
  options: VerifyPravaReconciliationTokenOptions = {},
): StrictClaimsVerificationResult<PravaReconciliationTokenClaims> {
  return verifyStrictClaims(
    token,
    PravaReconciliationTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds:
        PRAVA_RECONCILIATION_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export type PravaReconciliationForCheckoutVerificationResult =
  | {
      ok: true;
      claims: PravaReconciliationTokenClaims;
    }
  | {
      ok: false;
      error:
        | Extract<
            StrictClaimsVerificationResult<PravaReconciliationTokenClaims>,
            { ok: false }
          >["error"]
        | Extract<
            PravaReconciliationBindingComparisonResult,
            { ok: false }
          >["error"];
    };

export function verifyPravaReconciliationTokenForCheckout(
  token: unknown,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
  secret: string,
  options: VerifyPravaReconciliationTokenOptions = {},
): PravaReconciliationForCheckoutVerificationResult {
  const verified = verifyPravaReconciliationToken(
    token,
    secret,
    options,
  );

  if (!verified.ok) {
    return verified;
  }

  const binding = comparePravaReconciliationClaimsToCheckout(
    verified.claims,
    checkoutClaims,
    sessionClaims,
    order,
  );

  if (!binding.ok) {
    return binding;
  }

  return verified;
}
