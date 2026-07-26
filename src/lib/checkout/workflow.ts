import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  CHECKOUT_CURRENCY,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";
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
  HostedSessionSchema,
  PaymentProviderNameSchema,
  PaymentResultSchema,
  type HostedSession,
  type PaymentResult,
} from "@/lib/payments/types";

export const PAYMENT_SESSION_TOKEN_TYPE = "payment_session" as const;
export const PAYMENT_SESSION_TOKEN_DEFAULT_TTL_SECONDS = 10 * 60;
export const PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS = 20 * 60;

export const CHECKOUT_PENDING_RESULT_TOKEN_TYPE =
  "checkout_pending_result" as const;
export const CHECKOUT_PENDING_RESULT_TOKEN_DEFAULT_TTL_SECONDS =
  10 * 60;
export const CHECKOUT_PENDING_RESULT_TOKEN_MAX_TTL_SECONDS = 20 * 60;

export const CHECKOUT_RESULT_TOKEN_TYPE = "checkout_result" as const;
export const CHECKOUT_RESULT_TOKEN_DEFAULT_TTL_SECONDS = 60 * 60;
export const CHECKOUT_RESULT_TOKEN_MAX_TTL_SECONDS = 60 * 60;

export const CHECKOUT_RESULT_DECLINE_REASON_CODES = [
  "CUSTOMER_DECLINED",
  "MERCHANT_DECLINED",
  "PROVIDER_DECLINED",
] as const;

const DeclineReasonCodeSchema = z.enum(
  CHECKOUT_RESULT_DECLINE_REASON_CODES,
);

function temporalLifetimeIsValid(
  iat: number,
  exp: number,
  maximumSeconds: number,
): boolean {
  const lifetimeSeconds = exp - iat;

  return lifetimeSeconds > 0 && lifetimeSeconds <= maximumSeconds;
}

function addLifetimeIssue(
  context: z.RefinementCtx,
  message: string,
): void {
  context.addIssue({
    code: "custom",
    message,
    path: ["exp"],
  });
}

export const PaymentSessionTokenClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.literal(PAYMENT_SESSION_TOKEN_TYPE),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    attemptId: CheckoutAttemptIdSchema,
    checkoutJti: z.string().uuid(),
    provider: PaymentProviderNameSchema,
    sessionId: HostedSessionSchema.shape.sessionId,
    order: VerifiedOrderSchema,
  })
  .strict()
  .superRefine((claims, context) => {
    if (
      !temporalLifetimeIsValid(
        claims.iat,
        claims.exp,
        PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS,
      )
    ) {
      addLifetimeIssue(
        context,
        "Payment-session state must expire within 20 minutes.",
      );
    }
  });

export type PaymentSessionTokenClaims = z.infer<
  typeof PaymentSessionTokenClaimsSchema
>;

/**
 * Public-safe facts that prove the provider actually reported pending. The
 * marker deliberately excludes provider session IDs, customer data, and
 * payment credentials.
 */
export const PendingCheckoutResultMarkerSchema = z
  .object({
    status: z.literal("pending"),
    provider: PaymentProviderNameSchema,
    currency: z.literal(CHECKOUT_CURRENCY),
    totalCents: z.number().int().positive(),
    itemCount: z.literal(3),
  })
  .strict();

export type PendingCheckoutResultMarker = z.infer<
  typeof PendingCheckoutResultMarkerSchema
>;

export const PendingCheckoutResultTokenClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.literal(CHECKOUT_PENDING_RESULT_TOKEN_TYPE),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    checkoutJti: z.string().uuid(),
    paymentAttemptJti: z.string().uuid(),
    ...PendingCheckoutResultMarkerSchema.shape,
  })
  .strict()
  .superRefine((claims, context) => {
    if (
      !temporalLifetimeIsValid(
        claims.iat,
        claims.exp,
        CHECKOUT_PENDING_RESULT_TOKEN_MAX_TTL_SECONDS,
      )
    ) {
      addLifetimeIssue(
        context,
        "Pending-result state must expire within 20 minutes.",
      );
    }
  });

export type PendingCheckoutResultTokenClaims = z.infer<
  typeof PendingCheckoutResultTokenClaimsSchema
>;

const SanitizedCheckoutResultCommonShape = {
  provider: PaymentProviderNameSchema,
  currency: z.literal(CHECKOUT_CURRENCY),
  totalCents: z.number().int().positive(),
  itemCount: z.literal(3),
  completedAt: z.iso.datetime(),
};

const SanitizedApprovedCheckoutResultSchema = z
  .object({
    ...SanitizedCheckoutResultCommonShape,
    status: z.literal("approved"),
    orderReference: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9-]+$/),
  })
  .strict();

const SanitizedDeclinedCheckoutResultSchema = z
  .object({
    ...SanitizedCheckoutResultCommonShape,
    status: z.literal("declined"),
    reasonCode: DeclineReasonCodeSchema,
  })
  .strict();

export const SanitizedCheckoutResultSchema = z.discriminatedUnion(
  "status",
  [
    SanitizedApprovedCheckoutResultSchema,
    SanitizedDeclinedCheckoutResultSchema,
  ],
);

export type SanitizedCheckoutResult = z.infer<
  typeof SanitizedCheckoutResultSchema
>;

const CheckoutResultTokenCommonShape = {
  version: z.literal(CHECKOUT_TOKEN_VERSION),
  type: z.literal(CHECKOUT_RESULT_TOKEN_TYPE),
  jti: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  ...SanitizedCheckoutResultCommonShape,
};

const ApprovedCheckoutResultTokenClaimsSchema = z
  .object({
    ...CheckoutResultTokenCommonShape,
    status: z.literal("approved"),
    orderReference:
      SanitizedApprovedCheckoutResultSchema.shape.orderReference,
  })
  .strict();

const DeclinedCheckoutResultTokenClaimsSchema = z
  .object({
    ...CheckoutResultTokenCommonShape,
    status: z.literal("declined"),
    reasonCode: DeclineReasonCodeSchema,
  })
  .strict();

export const CheckoutResultTokenClaimsSchema = z
  .discriminatedUnion("status", [
    ApprovedCheckoutResultTokenClaimsSchema,
    DeclinedCheckoutResultTokenClaimsSchema,
  ])
  .superRefine((claims, context) => {
    if (
      !temporalLifetimeIsValid(
        claims.iat,
        claims.exp,
        CHECKOUT_RESULT_TOKEN_MAX_TTL_SECONDS,
      )
    ) {
      addLifetimeIssue(
        context,
        "Checkout-result state must expire within one hour.",
      );
    }

    const completedAtEpochSeconds = Math.floor(
      Date.parse(claims.completedAt) / 1_000,
    );

    if (completedAtEpochSeconds !== claims.iat) {
      context.addIssue({
        code: "custom",
        message: "The completion time must match token issuance.",
        path: ["completedAt"],
      });
    }
  });

export type CheckoutResultTokenClaims = z.infer<
  typeof CheckoutResultTokenClaimsSchema
>;

export type IssuePaymentSessionTokenInput = {
  attemptId: string;
  checkoutClaims: CheckoutTokenClaims;
  order: VerifiedOrder;
  session: HostedSession;
};

export type IssuePendingCheckoutResultInput = {
  checkoutClaims: CheckoutTokenClaims;
  sessionClaims: PaymentSessionTokenClaims;
  order: VerifiedOrder;
  paymentResult: PaymentResult;
};

export type IssueWorkflowTokenOptions = {
  nowEpochSeconds?: number;
  jti?: string;
  ttlSeconds?: number;
};

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isoTimestampFromEpochSeconds(
  epochSeconds: number,
): string | null {
  if (!isNonnegativeSafeInteger(epochSeconds)) {
    return null;
  }

  const timestamp = new Date(epochSeconds * 1_000);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function invalidClaims(message: string): never {
  throw new StrictTokenIssueError("INVALID_CLAIMS", message);
}

/**
 * Creates server-only payment-session state. Its expiry is bounded by the
 * requested lifetime, the reviewed checkout state, and the provider session.
 */
export function issuePaymentSessionToken(
  input: IssuePaymentSessionTokenInput,
  secret: string,
  options: IssueWorkflowTokenOptions = {},
): string {
  const checkoutClaims = CheckoutTokenClaimsSchema.safeParse(
    input.checkoutClaims,
  );
  const attemptId = CheckoutAttemptIdSchema.safeParse(input.attemptId);
  const order = VerifiedOrderSchema.safeParse(input.order);
  const session = HostedSessionSchema.safeParse(input.session);
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ?? PAYMENT_SESSION_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !attemptId.success ||
    !checkoutClaims.success ||
    !order.success ||
    !session.success ||
    !isNonnegativeSafeInteger(nowEpochSeconds) ||
    !isPositiveSafeInteger(ttlSeconds) ||
    ttlSeconds > PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS
  ) {
    invalidClaims("The payment-session token claims are invalid.");
  }

  if (!compareCheckoutClaimsToOrder(checkoutClaims.data, order.data).ok) {
    invalidClaims(
      "The payment-session order does not match the reviewed checkout.",
    );
  }

  const providerExpiresAt = Math.floor(
    Date.parse(session.data.expiresAt) / 1_000,
  );
  const exp = Math.min(
    nowEpochSeconds + ttlSeconds,
    checkoutClaims.data.exp,
    providerExpiresAt,
  );

  if (
    !isPositiveSafeInteger(providerExpiresAt) ||
    exp <= nowEpochSeconds ||
    checkoutClaims.data.iat >
      nowEpochSeconds + CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS
  ) {
    invalidClaims(
      "The payment session or reviewed checkout state has expired.",
    );
  }

  const claims: PaymentSessionTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: PAYMENT_SESSION_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp,
    attemptId: attemptId.data,
    checkoutJti: checkoutClaims.data.jti,
    provider: session.data.provider,
    sessionId: session.data.sessionId,
    order: order.data,
  };

  return signStrictClaims(
    claims,
    PaymentSessionTokenClaimsSchema,
    secret,
  );
}

export type VerifyWorkflowTokenOptions = Pick<
  StrictTokenVerificationOptions,
  "nowEpochSeconds" | "futureIatToleranceSeconds" | "maxTokenLength"
>;

export function verifyPaymentSessionToken(
  token: unknown,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): StrictClaimsVerificationResult<PaymentSessionTokenClaims> {
  return verifyStrictClaims(
    token,
    PaymentSessionTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds: PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export const PAYMENT_SESSION_BINDING_MISMATCH_REASONS = [
  "INVALID_STATE",
  "CHECKOUT_JTI",
  "ORDER",
] as const;

export type PaymentSessionBindingMismatchReason =
  (typeof PAYMENT_SESSION_BINDING_MISMATCH_REASONS)[number];

export type PaymentSessionBindingComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "PAYMENT_SESSION_BINDING_MISMATCH";
        reason: PaymentSessionBindingMismatchReason;
        message: string;
      };
    };

function sessionBindingMismatch(
  reason: PaymentSessionBindingMismatchReason,
): PaymentSessionBindingComparisonResult {
  return {
    ok: false,
    error: {
      code: "PAYMENT_SESSION_BINDING_MISMATCH",
      reason,
      message:
        "The payment session does not belong to this reviewed checkout.",
    },
  };
}

export function comparePaymentSessionClaimsToCheckout(
  sessionClaims: PaymentSessionTokenClaims,
  checkoutClaims: CheckoutTokenClaims,
): PaymentSessionBindingComparisonResult {
  const parsedSession =
    PaymentSessionTokenClaimsSchema.safeParse(sessionClaims);
  const parsedCheckout =
    CheckoutTokenClaimsSchema.safeParse(checkoutClaims);

  if (!parsedSession.success || !parsedCheckout.success) {
    return sessionBindingMismatch("INVALID_STATE");
  }

  if (parsedSession.data.checkoutJti !== parsedCheckout.data.jti) {
    return sessionBindingMismatch("CHECKOUT_JTI");
  }

  if (
    !compareCheckoutClaimsToOrder(
      parsedCheckout.data,
      parsedSession.data.order,
    ).ok
  ) {
    return sessionBindingMismatch("ORDER");
  }

  return { ok: true };
}

export type PaymentSessionForCheckoutVerificationResult =
  | {
      ok: true;
      claims: PaymentSessionTokenClaims;
    }
  | {
      ok: false;
      error:
        | Extract<
            StrictClaimsVerificationResult<PaymentSessionTokenClaims>,
            { ok: false }
          >["error"]
        | Extract<
            PaymentSessionBindingComparisonResult,
            { ok: false }
          >["error"];
    };

export function verifyPaymentSessionTokenForCheckout(
  token: unknown,
  checkoutClaims: CheckoutTokenClaims,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): PaymentSessionForCheckoutVerificationResult {
  const verified = verifyPaymentSessionToken(token, secret, options);

  if (!verified.ok) {
    return verified;
  }

  const binding = comparePaymentSessionClaimsToCheckout(
    verified.claims,
    checkoutClaims,
  );

  if (!binding.ok) {
    return binding;
  }

  return verified;
}

export type PendingCheckoutResultBindingComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "PENDING_CHECKOUT_RESULT_BINDING_MISMATCH";
        message: string;
      };
    };

function pendingResultBindingMismatch(): PendingCheckoutResultBindingComparisonResult {
  return {
    ok: false,
    error: {
      code: "PENDING_CHECKOUT_RESULT_BINDING_MISMATCH",
      message:
        "The pending result does not belong to this reviewed checkout.",
    },
  };
}

export function comparePendingCheckoutResultToState(
  pendingClaims: PendingCheckoutResultTokenClaims,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
): PendingCheckoutResultBindingComparisonResult {
  const parsedPending =
    PendingCheckoutResultTokenClaimsSchema.safeParse(pendingClaims);
  const parsedCheckout =
    CheckoutTokenClaimsSchema.safeParse(checkoutClaims);
  const parsedSession =
    PaymentSessionTokenClaimsSchema.safeParse(sessionClaims);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (
    !parsedPending.success ||
    !parsedCheckout.success ||
    !parsedSession.success ||
    !parsedOrder.success ||
    !comparePaymentSessionClaimsToCheckout(
      parsedSession.data,
      parsedCheckout.data,
    ).ok ||
    !compareCheckoutClaimsToOrder(
      parsedCheckout.data,
      parsedOrder.data,
    ).ok
  ) {
    return pendingResultBindingMismatch();
  }

  if (
    parsedPending.data.checkoutJti !== parsedCheckout.data.jti ||
    parsedPending.data.paymentAttemptJti !== parsedSession.data.jti ||
    parsedPending.data.provider !== parsedSession.data.provider ||
    parsedPending.data.currency !== parsedOrder.data.currency ||
    parsedPending.data.totalCents !== parsedOrder.data.totalCents ||
    parsedPending.data.itemCount !== parsedOrder.data.items.length ||
    parsedPending.data.iat < parsedSession.data.iat ||
    parsedPending.data.exp > parsedSession.data.exp ||
    parsedPending.data.exp > parsedCheckout.data.exp
  ) {
    return pendingResultBindingMismatch();
  }

  return { ok: true };
}

export type IssuedPendingCheckoutResult = {
  token: string;
  marker: PendingCheckoutResultMarker;
};

/**
 * Issues a short-lived marker only after a provider has returned pending. Its
 * lifetime cannot outlive either the reviewed checkout or payment-session
 * state needed to safely interpret it.
 */
export function issuePendingCheckoutResult(
  input: IssuePendingCheckoutResultInput,
  secret: string,
  options: IssueWorkflowTokenOptions = {},
): IssuedPendingCheckoutResult {
  const checkoutClaims = CheckoutTokenClaimsSchema.safeParse(
    input.checkoutClaims,
  );
  const sessionClaims = PaymentSessionTokenClaimsSchema.safeParse(
    input.sessionClaims,
  );
  const order = VerifiedOrderSchema.safeParse(input.order);
  const paymentResult = PaymentResultSchema.safeParse(
    input.paymentResult,
  );
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ??
    CHECKOUT_PENDING_RESULT_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !checkoutClaims.success ||
    !sessionClaims.success ||
    !order.success ||
    !paymentResult.success ||
    paymentResult.data.status !== "pending" ||
    paymentResult.data.provider !== sessionClaims.data.provider ||
    paymentResult.data.sessionId !== sessionClaims.data.sessionId ||
    !isNonnegativeSafeInteger(nowEpochSeconds) ||
    !isPositiveSafeInteger(ttlSeconds) ||
    ttlSeconds > CHECKOUT_PENDING_RESULT_TOKEN_MAX_TTL_SECONDS
  ) {
    invalidClaims("The pending-result token claims are invalid.");
  }

  const exp = Math.min(
    nowEpochSeconds + ttlSeconds,
    checkoutClaims.data.exp,
    sessionClaims.data.exp,
  );
  const marker = PendingCheckoutResultMarkerSchema.safeParse({
    status: "pending",
    provider: paymentResult.data.provider,
    currency: order.data.currency,
    totalCents: order.data.totalCents,
    itemCount: order.data.items.length,
  });

  if (
    !marker.success ||
    exp <= nowEpochSeconds ||
    checkoutClaims.data.iat >
      nowEpochSeconds + CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS ||
    sessionClaims.data.iat >
      nowEpochSeconds + CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS
  ) {
    invalidClaims(
      "The payment session or reviewed checkout state has expired.",
    );
  }

  const claims: PendingCheckoutResultTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: CHECKOUT_PENDING_RESULT_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp,
    checkoutJti: checkoutClaims.data.jti,
    paymentAttemptJti: sessionClaims.data.jti,
    ...marker.data,
  };

  if (
    !comparePendingCheckoutResultToState(
      claims,
      checkoutClaims.data,
      sessionClaims.data,
      order.data,
    ).ok
  ) {
    invalidClaims("The pending-result token claims are invalid.");
  }

  return {
    token: signStrictClaims(
      claims,
      PendingCheckoutResultTokenClaimsSchema,
      secret,
    ),
    marker: marker.data,
  };
}

export function verifyPendingCheckoutResultToken(
  token: unknown,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): StrictClaimsVerificationResult<PendingCheckoutResultTokenClaims> {
  return verifyStrictClaims(
    token,
    PendingCheckoutResultTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds:
        CHECKOUT_PENDING_RESULT_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export type PendingCheckoutResultForCheckoutVerificationResult =
  | {
      ok: true;
      claims: PendingCheckoutResultTokenClaims;
    }
  | {
      ok: false;
      error:
        | Extract<
            StrictClaimsVerificationResult<PendingCheckoutResultTokenClaims>,
            { ok: false }
          >["error"]
        | Extract<
            PendingCheckoutResultBindingComparisonResult,
            { ok: false }
          >["error"];
    };

export function verifyPendingCheckoutResultTokenForCheckout(
  token: unknown,
  checkoutClaims: CheckoutTokenClaims,
  sessionClaims: PaymentSessionTokenClaims,
  order: VerifiedOrder,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): PendingCheckoutResultForCheckoutVerificationResult {
  const verified = verifyPendingCheckoutResultToken(
    token,
    secret,
    options,
  );

  if (!verified.ok) {
    return verified;
  }

  const binding = comparePendingCheckoutResultToState(
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

export type CreateSanitizedCheckoutResultOptions = {
  nowEpochSeconds?: number;
};

/**
 * Drops provider session identifiers and accepts only terminal payment states.
 */
export function createSanitizedCheckoutResult(
  order: VerifiedOrder,
  paymentResult: PaymentResult,
  options: CreateSanitizedCheckoutResultOptions = {},
): SanitizedCheckoutResult {
  const parsedOrder = VerifiedOrderSchema.safeParse(order);
  const parsedPaymentResult = PaymentResultSchema.safeParse(paymentResult);
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const completedAt = isoTimestampFromEpochSeconds(nowEpochSeconds);

  if (
    !parsedOrder.success ||
    !parsedPaymentResult.success ||
    parsedPaymentResult.data.status === "pending" ||
    completedAt === null
  ) {
    invalidClaims("A terminal checkout result could not be created.");
  }

  const commonResult = {
    provider: parsedPaymentResult.data.provider,
    currency: parsedOrder.data.currency,
    totalCents: parsedOrder.data.totalCents,
    itemCount: parsedOrder.data.items.length,
    completedAt,
  };
  const result =
    parsedPaymentResult.data.status === "approved"
      ? {
          ...commonResult,
          status: parsedPaymentResult.data.status,
          orderReference: parsedPaymentResult.data.orderReference,
        }
      : {
          ...commonResult,
          status: parsedPaymentResult.data.status,
          reasonCode: parsedPaymentResult.data.reasonCode,
        };
  const parsedResult = SanitizedCheckoutResultSchema.safeParse(result);

  if (!parsedResult.success) {
    invalidClaims("A terminal checkout result could not be created.");
  }

  return parsedResult.data;
}

export function issueCheckoutResultToken(
  result: SanitizedCheckoutResult,
  secret: string,
  options: IssueWorkflowTokenOptions = {},
): string {
  const parsedResult = SanitizedCheckoutResultSchema.safeParse(result);
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ?? CHECKOUT_RESULT_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !parsedResult.success ||
    !isNonnegativeSafeInteger(nowEpochSeconds) ||
    !isPositiveSafeInteger(ttlSeconds) ||
    ttlSeconds > CHECKOUT_RESULT_TOKEN_MAX_TTL_SECONDS ||
    Math.floor(Date.parse(parsedResult.data.completedAt) / 1_000) !==
      nowEpochSeconds
  ) {
    invalidClaims("The checkout-result token claims are invalid.");
  }

  const claims: CheckoutResultTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: CHECKOUT_RESULT_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp: nowEpochSeconds + ttlSeconds,
    ...parsedResult.data,
  };

  return signStrictClaims(
    claims,
    CheckoutResultTokenClaimsSchema,
    secret,
  );
}

export type IssuedCheckoutResult = {
  token: string;
  result: SanitizedCheckoutResult;
};

export function issueTerminalCheckoutResult(
  order: VerifiedOrder,
  paymentResult: PaymentResult,
  secret: string,
  options: IssueWorkflowTokenOptions = {},
): IssuedCheckoutResult {
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const result = createSanitizedCheckoutResult(order, paymentResult, {
    nowEpochSeconds,
  });
  const token = issueCheckoutResultToken(result, secret, {
    ...options,
    nowEpochSeconds,
  });

  return { token, result };
}

export function verifyCheckoutResultToken(
  token: unknown,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): StrictClaimsVerificationResult<CheckoutResultTokenClaims> {
  return verifyStrictClaims(
    token,
    CheckoutResultTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds: CHECKOUT_RESULT_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export function checkoutResultFromClaims(
  claims: CheckoutResultTokenClaims,
): SanitizedCheckoutResult | null {
  const parsedClaims =
    CheckoutResultTokenClaimsSchema.safeParse(claims);

  if (!parsedClaims.success) {
    return null;
  }

  const { version, type, jti, iat, exp, ...result } =
    parsedClaims.data;

  void version;
  void type;
  void jti;
  void iat;
  void exp;

  const parsedResult = SanitizedCheckoutResultSchema.safeParse(result);

  return parsedResult.success ? parsedResult.data : null;
}

export const CHECKOUT_RESULT_ORDER_MISMATCH_REASONS = [
  "INVALID_STATE",
  "CURRENCY",
  "TOTAL",
  "ITEM_COUNT",
] as const;

export type CheckoutResultOrderMismatchReason =
  (typeof CHECKOUT_RESULT_ORDER_MISMATCH_REASONS)[number];

export type CheckoutResultOrderComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "CHECKOUT_RESULT_ORDER_MISMATCH";
        reason: CheckoutResultOrderMismatchReason;
        message: string;
      };
    };

function resultOrderMismatch(
  reason: CheckoutResultOrderMismatchReason,
): CheckoutResultOrderComparisonResult {
  return {
    ok: false,
    error: {
      code: "CHECKOUT_RESULT_ORDER_MISMATCH",
      reason,
      message: "The checkout result does not match this order.",
    },
  };
}

export function compareCheckoutResultToOrder(
  result: SanitizedCheckoutResult,
  order: VerifiedOrder,
): CheckoutResultOrderComparisonResult {
  const parsedResult = SanitizedCheckoutResultSchema.safeParse(result);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (!parsedResult.success || !parsedOrder.success) {
    return resultOrderMismatch("INVALID_STATE");
  }

  if (parsedResult.data.currency !== parsedOrder.data.currency) {
    return resultOrderMismatch("CURRENCY");
  }

  if (parsedResult.data.totalCents !== parsedOrder.data.totalCents) {
    return resultOrderMismatch("TOTAL");
  }

  if (parsedResult.data.itemCount !== parsedOrder.data.items.length) {
    return resultOrderMismatch("ITEM_COUNT");
  }

  return { ok: true };
}
