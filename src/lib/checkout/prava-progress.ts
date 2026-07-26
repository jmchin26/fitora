import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import {
  CHECKOUT_CURRENCY,
  CHECKOUT_MERCHANT_ID,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS,
  CHECKOUT_TOKEN_MIN_SECRET_CHARACTERS,
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

export const PRAVA_PROGRESS_TOKEN_TYPE = "prava_progress" as const;
export const PRAVA_PROGRESS_STAGE =
  "merchant_report_attempted" as const;
export const PRAVA_PROGRESS_TOKEN_DEFAULT_TTL_SECONDS = 10 * 60;
export const PRAVA_PROGRESS_TOKEN_MAX_TTL_SECONDS =
  PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS;

const PRAVA_TRANSACTION_FINGERPRINT_CONTEXT =
  "fitora.prava.transaction-reference.v1";
const SHA256_BASE64URL_LENGTH = 43;
const MAX_TRANSACTION_REFERENCE_LENGTH = 255;
const MAX_SECRET_CHARACTERS = 4_096;

const PravaTransactionReferenceSchema = z
  .string()
  .min(1)
  .max(MAX_TRANSACTION_REFERENCE_LENGTH)
  .refine((value) => value === value.trim())
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

export const PravaTransactionFingerprintSchema = z
  .string()
  .length(SHA256_BASE64URL_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

const PravaApprovedExpectedOutcomeSchema = z
  .object({
    status: z.literal("approved"),
    orderReference: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9-]+$/),
  })
  .strict();

const PravaDeclinedExpectedOutcomeSchema = z
  .object({
    status: z.literal("declined"),
    reasonCode: z.literal("MERCHANT_DECLINED"),
  })
  .strict();

export const PravaProgressExpectedOutcomeSchema =
  z.discriminatedUnion("status", [
    PravaApprovedExpectedOutcomeSchema,
    PravaDeclinedExpectedOutcomeSchema,
  ]);

export type PravaProgressExpectedOutcome = z.infer<
  typeof PravaProgressExpectedOutcomeSchema
>;

export const PravaProgressTokenClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.literal(PRAVA_PROGRESS_TOKEN_TYPE),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    checkoutJti: z.string().uuid(),
    paymentAttemptJti: z.string().uuid(),
    provider: z.literal("prava"),
    stage: z.literal(PRAVA_PROGRESS_STAGE),
    merchantId: z.literal(CHECKOUT_MERCHANT_ID),
    currency: z.literal(CHECKOUT_CURRENCY),
    totalCents: z.number().int().positive(),
    itemCount: z.literal(3),
    transactionFingerprint: PravaTransactionFingerprintSchema,
    expectedOutcome: PravaProgressExpectedOutcomeSchema,
  })
  .strict()
  .superRefine((claims, context) => {
    const lifetimeSeconds = claims.exp - claims.iat;

    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds > PRAVA_PROGRESS_TOKEN_MAX_TTL_SECONDS
    ) {
      context.addIssue({
        code: "custom",
        message: "Prava progress state must expire within 20 minutes.",
        path: ["exp"],
      });
    }
  });

export type PravaProgressTokenClaims = z.infer<
  typeof PravaProgressTokenClaimsSchema
>;

export type IssuePravaProgressTokenInput = {
  checkoutClaims: CheckoutTokenClaims;
  sessionClaims: PaymentSessionTokenClaims;
  order: VerifiedOrder;
  transactionReference: string;
  expectedOutcome: PravaProgressExpectedOutcome;
};

export type IssuePravaProgressTokenOptions = {
  nowEpochSeconds?: number;
  jti?: string;
  ttlSeconds?: number;
};

export type VerifyPravaProgressTokenOptions = Pick<
  StrictTokenVerificationOptions,
  "nowEpochSeconds" | "futureIatToleranceSeconds" | "maxTokenLength"
>;

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function secretIsValid(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    Array.from(secret).length >= CHECKOUT_TOKEN_MIN_SECRET_CHARACTERS &&
    Array.from(secret).length <= MAX_SECRET_CHARACTERS
  );
}

function invalidClaims(message: string): never {
  throw new StrictTokenIssueError("INVALID_CLAIMS", message);
}

function createTransactionFingerprint(
  transactionReference: string,
  secret: string,
): Buffer {
  return createHmac("sha256", secret)
    .update(PRAVA_TRANSACTION_FINGERPRINT_CONTEXT, "utf8")
    .update("\0", "utf8")
    .update(transactionReference, "utf8")
    .digest();
}

export const PRAVA_PROGRESS_BINDING_MISMATCH_REASONS = [
  "INVALID_STATE",
  "PROVIDER",
  "CHECKOUT_JTI",
  "PAYMENT_ATTEMPT_JTI",
  "TEMPORAL_BOUNDARY",
  "ORDER",
] as const;

export type PravaProgressBindingMismatchReason =
  (typeof PRAVA_PROGRESS_BINDING_MISMATCH_REASONS)[number];

export type PravaProgressBindingComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "PRAVA_PROGRESS_BINDING_MISMATCH";
        reason: PravaProgressBindingMismatchReason;
        message: string;
      };
    };

function bindingMismatch(
  reason: PravaProgressBindingMismatchReason,
): PravaProgressBindingComparisonResult {
  return {
    ok: false,
    error: {
      code: "PRAVA_PROGRESS_BINDING_MISMATCH",
      reason,
      message:
        "The Prava retry state does not belong to this reviewed checkout.",
    },
  };
}

/**
 * Confirms that a progress marker belongs to the same reviewed order and
 * payment attempt. The marker deliberately binds via JTIs rather than copying
 * the provider session identifier.
 */
export function comparePravaProgressClaimsToCheckout(
  claims: PravaProgressTokenClaims,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
): PravaProgressBindingComparisonResult {
  const parsedClaims =
    PravaProgressTokenClaimsSchema.safeParse(claims);
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
 * Issues the retry marker only after the merchant has returned its terminal
 * decision and a Prava report has been attempted. Its expiry can never outlive
 * either the reviewed checkout or its provider session.
 */
export function issuePravaProgressToken(
  input: IssuePravaProgressTokenInput,
  secret: string,
  options: IssuePravaProgressTokenOptions = {},
): string {
  const checkoutClaims = CheckoutTokenClaimsSchema.safeParse(
    input.checkoutClaims,
  );
  const sessionClaims = PaymentSessionTokenClaimsSchema.safeParse(
    input.sessionClaims,
  );
  const order = VerifiedOrderSchema.safeParse(input.order);
  const transactionReference =
    PravaTransactionReferenceSchema.safeParse(
      input.transactionReference,
    );
  const expectedOutcome =
    PravaProgressExpectedOutcomeSchema.safeParse(
      input.expectedOutcome,
    );
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ?? PRAVA_PROGRESS_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !checkoutClaims.success ||
    !sessionClaims.success ||
    !order.success ||
    !transactionReference.success ||
    !expectedOutcome.success ||
    !secretIsValid(secret) ||
    !isNonnegativeSafeInteger(nowEpochSeconds) ||
    !isPositiveSafeInteger(ttlSeconds) ||
    ttlSeconds > PRAVA_PROGRESS_TOKEN_MAX_TTL_SECONDS
  ) {
    invalidClaims("The Prava progress token claims are invalid.");
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
      "The Prava progress state does not match the payment attempt.",
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

  const claims: PravaProgressTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: PRAVA_PROGRESS_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp,
    checkoutJti: checkoutClaims.data.jti,
    paymentAttemptJti: sessionClaims.data.jti,
    provider: "prava",
    stage: PRAVA_PROGRESS_STAGE,
    merchantId: order.data.merchantId,
    currency: order.data.currency,
    totalCents: order.data.totalCents,
    itemCount: order.data.items.length,
    transactionFingerprint: createTransactionFingerprint(
      transactionReference.data,
      secret,
    ).toString("base64url"),
    expectedOutcome: expectedOutcome.data,
  };

  const binding = comparePravaProgressClaimsToCheckout(
    claims,
    checkoutClaims.data,
    sessionClaims.data,
    order.data,
  );

  if (!binding.ok) {
    invalidClaims("The Prava progress token claims are invalid.");
  }

  return signStrictClaims(
    claims,
    PravaProgressTokenClaimsSchema,
    secret,
  );
}

export function verifyPravaProgressToken(
  token: unknown,
  secret: string,
  options: VerifyPravaProgressTokenOptions = {},
): StrictClaimsVerificationResult<PravaProgressTokenClaims> {
  return verifyStrictClaims(
    token,
    PravaProgressTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds: PRAVA_PROGRESS_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export type PravaProgressForCheckoutVerificationResult =
  | {
      ok: true;
      claims: PravaProgressTokenClaims;
    }
  | {
      ok: false;
      error:
        | Extract<
            StrictClaimsVerificationResult<PravaProgressTokenClaims>,
            { ok: false }
          >["error"]
        | Extract<
            PravaProgressBindingComparisonResult,
            { ok: false }
          >["error"];
    };

export function verifyPravaProgressTokenForCheckout(
  token: unknown,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
  secret: string,
  options: VerifyPravaProgressTokenOptions = {},
): PravaProgressForCheckoutVerificationResult {
  const verified = verifyPravaProgressToken(token, secret, options);

  if (!verified.ok) {
    return verified;
  }

  const binding = comparePravaProgressClaimsToCheckout(
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

/**
 * Matches a provider-returned transaction reference without exposing it in
 * signed state. Valid fingerprints are always compared as 32-byte values with
 * Node's constant-time primitive.
 */
export function matchesPravaProgressTransactionReference(
  claims: unknown,
  transactionReference: unknown,
  secret: string,
): boolean {
  const parsedClaims =
    PravaProgressTokenClaimsSchema.safeParse(claims);
  const parsedTransactionReference =
    PravaTransactionReferenceSchema.safeParse(transactionReference);

  if (
    !parsedClaims.success ||
    !parsedTransactionReference.success ||
    !secretIsValid(secret)
  ) {
    return false;
  }

  const suppliedFingerprint = Buffer.from(
    parsedClaims.data.transactionFingerprint,
    "base64url",
  );
  const expectedFingerprint = createTransactionFingerprint(
    parsedTransactionReference.data,
    secret,
  );

  return (
    suppliedFingerprint.length === expectedFingerprint.length &&
    timingSafeEqual(suppliedFingerprint, expectedFingerprint)
  );
}
