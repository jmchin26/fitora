import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import { OutfitReferenceSchema } from "@/lib/catalogue/schemas";
import {
  CHECKOUT_CURRENCY,
  CHECKOUT_MERCHANT_ID,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";

export const CHECKOUT_TOKEN_VERSION = "v1" as const;
export const CHECKOUT_TOKEN_TYPE = "checkout" as const;
export const CHECKOUT_TOKEN_DEFAULT_TTL_SECONDS = 5 * 60;
export const CHECKOUT_TOKEN_MAX_TTL_SECONDS = 15 * 60;
export const CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS = 30;
export const CHECKOUT_TOKEN_MAX_LENGTH = 4_096;
export const CHECKOUT_TOKEN_MIN_SECRET_CHARACTERS = 32;

const BaseTemporalClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .passthrough()
  .superRefine((claims, context) => {
    if (claims.exp <= claims.iat) {
      context.addIssue({
        code: "custom",
        message: "Token expiry must be after issuance.",
        path: ["exp"],
      });
    }
  });

export const CheckoutTokenClaimsSchema = z
  .object({
    version: z.literal(CHECKOUT_TOKEN_VERSION),
    type: z.literal(CHECKOUT_TOKEN_TYPE),
    jti: z.string().uuid(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    reference: OutfitReferenceSchema,
    expectedTotalCents: z.number().int().positive(),
    currency: z.literal(CHECKOUT_CURRENCY),
    merchantId: z.literal(CHECKOUT_MERCHANT_ID),
  })
  .strict()
  .superRefine((claims, context) => {
    const lifetimeSeconds = claims.exp - claims.iat;

    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds > CHECKOUT_TOKEN_MAX_TTL_SECONDS
    ) {
      context.addIssue({
        code: "custom",
        message: "Checkout token lifetime is outside the allowed range.",
        path: ["exp"],
      });
    }
  });

export type CheckoutTokenClaims = z.infer<
  typeof CheckoutTokenClaimsSchema
>;

export const STRICT_TOKEN_ISSUE_ERROR_CODES = [
  "INVALID_SECRET",
  "INVALID_CLAIMS",
] as const;

export type StrictTokenIssueErrorCode =
  (typeof STRICT_TOKEN_ISSUE_ERROR_CODES)[number];

export class StrictTokenIssueError extends Error {
  readonly code: StrictTokenIssueErrorCode;

  constructor(code: StrictTokenIssueErrorCode, message: string) {
    super(message);
    this.name = "StrictTokenIssueError";
    this.code = code;
  }
}

export const STRICT_TOKEN_VERIFICATION_ERROR_CODES = [
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_NOT_YET_VALID",
] as const;

export type StrictTokenVerificationErrorCode =
  (typeof STRICT_TOKEN_VERIFICATION_ERROR_CODES)[number];

export type StrictTokenVerificationError = {
  code: StrictTokenVerificationErrorCode;
  message: string;
};

export type StrictClaimsVerificationResult<TClaims> =
  | {
      ok: true;
      claims: TClaims;
    }
  | {
      ok: false;
      error: StrictTokenVerificationError;
    };

export type StrictTokenVerificationOptions = {
  nowEpochSeconds?: number;
  futureIatToleranceSeconds?: number;
  maxTokenLength?: number;
  maxLifetimeSeconds?: number;
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function secretIsValid(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    Array.from(secret).length >= CHECKOUT_TOKEN_MIN_SECRET_CHARACTERS &&
    Array.from(secret).length <= 4_096
  );
}

function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const objectValue = value as { readonly [key: string]: JsonValue };
  const entries = Object.keys(objectValue)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeJson(objectValue[key])}`,
    );

  return `{${entries.join(",")}}`;
}

function createSignature(payloadSegment: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadSegment).digest();
}

function invalidToken(): StrictClaimsVerificationResult<never> {
  return {
    ok: false,
    error: {
      code: "TOKEN_INVALID",
      message: "Checkout state is invalid.",
    },
  };
}

function expiredToken(): StrictClaimsVerificationResult<never> {
  return {
    ok: false,
    error: {
      code: "TOKEN_EXPIRED",
      message: "Checkout state has expired.",
    },
  };
}

function futureToken(): StrictClaimsVerificationResult<never> {
  return {
    ok: false,
    error: {
      code: "TOKEN_NOT_YET_VALID",
      message: "Checkout state is not yet valid.",
    },
  };
}

function isNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Reusable HMAC envelope for other short-lived, strict server cookie claims.
 * The caller-supplied schema is applied before signing, while the common
 * version/type/jti/iat/exp contract is always enforced here.
 */
export function signStrictClaims<TSchema extends z.ZodType>(
  claims: z.input<TSchema>,
  schema: TSchema,
  secret: string,
): string {
  if (!secretIsValid(secret)) {
    throw new StrictTokenIssueError(
      "INVALID_SECRET",
      `The signing secret must contain at least ${CHECKOUT_TOKEN_MIN_SECRET_CHARACTERS} characters.`,
    );
  }

  const parsed = schema.safeParse(claims);

  if (!parsed.success || !BaseTemporalClaimsSchema.safeParse(parsed.data).success) {
    throw new StrictTokenIssueError(
      "INVALID_CLAIMS",
      "The token claims are invalid.",
    );
  }

  let payloadText: string;

  try {
    payloadText = canonicalizeJson(parsed.data as JsonValue);
  } catch {
    throw new StrictTokenIssueError(
      "INVALID_CLAIMS",
      "The token claims are invalid.",
    );
  }

  const payloadSegment = Buffer.from(payloadText, "utf8").toString(
    "base64url",
  );
  const signatureSegment = createSignature(payloadSegment, secret).toString(
    "base64url",
  );
  const token = `${payloadSegment}.${signatureSegment}`;

  if (token.length > CHECKOUT_TOKEN_MAX_LENGTH) {
    throw new StrictTokenIssueError(
      "INVALID_CLAIMS",
      "The token claims are too large.",
    );
  }

  return token;
}

/**
 * Verifies the HMAC before decoding or parsing the JSON payload. It also
 * rejects alternate encodings and non-canonical JSON, keeping one stable wire
 * representation for every claim set.
 */
export function verifyStrictClaims<TSchema extends z.ZodType>(
  token: unknown,
  schema: TSchema,
  secret: string,
  options: StrictTokenVerificationOptions = {},
): StrictClaimsVerificationResult<z.output<TSchema>> {
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const futureIatToleranceSeconds =
    options.futureIatToleranceSeconds ??
    CHECKOUT_TOKEN_FUTURE_IAT_TOLERANCE_SECONDS;
  const maxTokenLength =
    options.maxTokenLength ?? CHECKOUT_TOKEN_MAX_LENGTH;
  const maxLifetimeSeconds =
    options.maxLifetimeSeconds ?? CHECKOUT_TOKEN_MAX_TTL_SECONDS;

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > maxTokenLength ||
    !secretIsValid(secret) ||
    !isNonnegativeInteger(nowEpochSeconds) ||
    !isNonnegativeInteger(futureIatToleranceSeconds) ||
    !isPositiveInteger(maxTokenLength) ||
    !isPositiveInteger(maxLifetimeSeconds)
  ) {
    return invalidToken();
  }

  const segments = token.split(".");

  if (
    segments.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(segments[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(segments[1])
  ) {
    return invalidToken();
  }

  const [payloadSegment, signatureSegment] = segments;
  let suppliedSignature: Buffer;

  try {
    suppliedSignature = Buffer.from(signatureSegment, "base64url");
  } catch {
    return invalidToken();
  }

  if (
    suppliedSignature.length !== 32 ||
    suppliedSignature.toString("base64url") !== signatureSegment
  ) {
    return invalidToken();
  }

  const expectedSignature = createSignature(payloadSegment, secret);

  if (!timingSafeEqual(expectedSignature, suppliedSignature)) {
    return invalidToken();
  }

  let payloadBytes: Buffer;

  try {
    payloadBytes = Buffer.from(payloadSegment, "base64url");
  } catch {
    return invalidToken();
  }

  if (payloadBytes.toString("base64url") !== payloadSegment) {
    return invalidToken();
  }

  const payloadText = payloadBytes.toString("utf8");

  if (!Buffer.from(payloadText, "utf8").equals(payloadBytes)) {
    return invalidToken();
  }

  let rawClaims: unknown;

  try {
    rawClaims = JSON.parse(payloadText);
  } catch {
    return invalidToken();
  }

  const parsed = schema.safeParse(rawClaims);

  if (!parsed.success) {
    return invalidToken();
  }

  const temporal = BaseTemporalClaimsSchema.safeParse(parsed.data);

  if (!temporal.success) {
    return invalidToken();
  }

  let canonicalPayload: string;

  try {
    canonicalPayload = canonicalizeJson(parsed.data as JsonValue);
  } catch {
    return invalidToken();
  }

  if (canonicalPayload !== payloadText) {
    return invalidToken();
  }

  const lifetimeSeconds = temporal.data.exp - temporal.data.iat;

  if (
    lifetimeSeconds <= 0 ||
    lifetimeSeconds > maxLifetimeSeconds
  ) {
    return invalidToken();
  }

  if (temporal.data.exp <= nowEpochSeconds) {
    return expiredToken();
  }

  if (
    temporal.data.iat >
    nowEpochSeconds + futureIatToleranceSeconds
  ) {
    return futureToken();
  }

  return { ok: true, claims: parsed.data };
}

export type IssueCheckoutTokenOptions = {
  nowEpochSeconds?: number;
  jti?: string;
  ttlSeconds?: number;
};

export function issueCheckoutToken(
  order: VerifiedOrder,
  secret: string,
  options: IssueCheckoutTokenOptions = {},
): string {
  const parsedOrder = VerifiedOrderSchema.safeParse(order);
  const nowEpochSeconds =
    options.nowEpochSeconds ?? Math.floor(Date.now() / 1_000);
  const ttlSeconds =
    options.ttlSeconds ?? CHECKOUT_TOKEN_DEFAULT_TTL_SECONDS;
  const jti = options.jti ?? randomUUID();

  if (
    !parsedOrder.success ||
    !isNonnegativeInteger(nowEpochSeconds) ||
    !isPositiveInteger(ttlSeconds) ||
    ttlSeconds > CHECKOUT_TOKEN_MAX_TTL_SECONDS
  ) {
    throw new StrictTokenIssueError(
      "INVALID_CLAIMS",
      "The checkout token claims are invalid.",
    );
  }

  const claims: CheckoutTokenClaims = {
    version: CHECKOUT_TOKEN_VERSION,
    type: CHECKOUT_TOKEN_TYPE,
    jti,
    iat: nowEpochSeconds,
    exp: nowEpochSeconds + ttlSeconds,
    reference: parsedOrder.data.reference,
    expectedTotalCents: parsedOrder.data.totalCents,
    currency: parsedOrder.data.currency,
    merchantId: parsedOrder.data.merchantId,
  };

  return signStrictClaims(
    claims,
    CheckoutTokenClaimsSchema,
    secret,
  );
}

export type VerifyCheckoutTokenOptions = Pick<
  StrictTokenVerificationOptions,
  "nowEpochSeconds" | "futureIatToleranceSeconds" | "maxTokenLength"
>;

export function verifyCheckoutToken(
  token: unknown,
  secret: string,
  options: VerifyCheckoutTokenOptions = {},
): StrictClaimsVerificationResult<CheckoutTokenClaims> {
  return verifyStrictClaims(
    token,
    CheckoutTokenClaimsSchema,
    secret,
    {
      ...options,
      maxLifetimeSeconds: CHECKOUT_TOKEN_MAX_TTL_SECONDS,
    },
  );
}

export const CHECKOUT_ORDER_MISMATCH_REASONS = [
  "INVALID_ORDER",
  "REFERENCE",
  "TOTAL",
  "CURRENCY",
  "MERCHANT",
] as const;

export type CheckoutOrderMismatchReason =
  (typeof CHECKOUT_ORDER_MISMATCH_REASONS)[number];

export type CheckoutOrderComparisonResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "CHECKOUT_ORDER_MISMATCH";
        reason: CheckoutOrderMismatchReason;
        message: string;
      };
    };

function orderMismatch(
  reason: CheckoutOrderMismatchReason,
): CheckoutOrderComparisonResult {
  return {
    ok: false,
    error: {
      code: "CHECKOUT_ORDER_MISMATCH",
      reason,
      message: "The checkout order has changed and must be reviewed again.",
    },
  };
}

/**
 * Compare claims with a newly rehydrated order immediately before creating or
 * finalizing a payment session. A catalogue price change is caught by TOTAL.
 */
export function compareCheckoutClaimsToOrder(
  claims: CheckoutTokenClaims,
  order: VerifiedOrder,
): CheckoutOrderComparisonResult {
  const parsedClaims = CheckoutTokenClaimsSchema.safeParse(claims);
  const parsedOrder = VerifiedOrderSchema.safeParse(order);

  if (!parsedClaims.success || !parsedOrder.success) {
    return orderMismatch("INVALID_ORDER");
  }

  if (
    canonicalizeJson(parsedClaims.data.reference as JsonValue) !==
    canonicalizeJson(parsedOrder.data.reference as JsonValue)
  ) {
    return orderMismatch("REFERENCE");
  }

  if (
    parsedClaims.data.expectedTotalCents !==
    parsedOrder.data.totalCents
  ) {
    return orderMismatch("TOTAL");
  }

  if (parsedClaims.data.currency !== parsedOrder.data.currency) {
    return orderMismatch("CURRENCY");
  }

  if (parsedClaims.data.merchantId !== parsedOrder.data.merchantId) {
    return orderMismatch("MERCHANT");
  }

  return { ok: true };
}

export type CheckoutTokenForOrderVerificationResult =
  | {
      ok: true;
      claims: CheckoutTokenClaims;
    }
  | {
      ok: false;
      error:
        | StrictTokenVerificationError
        | Extract<CheckoutOrderComparisonResult, { ok: false }>["error"];
    };

export function verifyCheckoutTokenForOrder(
  token: unknown,
  order: VerifiedOrder,
  secret: string,
  options: VerifyCheckoutTokenOptions = {},
): CheckoutTokenForOrderVerificationResult {
  const verified = verifyCheckoutToken(token, secret, options);

  if (!verified.ok) {
    return verified;
  }

  const comparison = compareCheckoutClaimsToOrder(
    verified.claims,
    order,
  );

  if (!comparison.ok) {
    return comparison;
  }

  return verified;
}
