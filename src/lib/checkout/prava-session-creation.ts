import { z } from "zod";

import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";
import { isPravaClientError } from "@/lib/payments/prava";
import type { HostedSession } from "@/lib/payments/types";

const CheckoutJtiSchema = z.string().uuid();
const ApprovalFingerprintSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

const MAX_CACHED_ATTEMPTS = 256;
const PENDING_ATTEMPT_TTL_MS = 20 * 60 * 1_000;

type CachedAttempt = {
  approvalFingerprint: string;
  checkoutJti: string;
  expiresAtMilliseconds: number;
  operation: Promise<PravaCheckoutAttemptState>;
};

const cachedAttempts = new Map<string, CachedAttempt>();

export class PravaSessionAlreadyActiveError extends Error {
  constructor() {
    super("A Prava payment session is already active for this attempt.");
    this.name = "PravaSessionAlreadyActiveError";
  }
}

export class PravaSessionCapacityError extends Error {
  constructor() {
    super("The local Prava session-creation cache is at capacity.");
    this.name = "PravaSessionCapacityError";
  }
}

export type PravaCheckoutAttemptState = Readonly<{
  session: HostedSession;
  hostedUrl: string;
  reviewToken: string;
  sessionToken: string;
}>;

function pruneExpiredAttempts(nowMilliseconds: number): void {
  for (const [attemptId, attempt] of cachedAttempts) {
    if (attempt.expiresAtMilliseconds <= nowMilliseconds) {
      cachedAttempts.delete(attemptId);
    }
  }
}

/**
 * Reports whether this process is already creating, or recently created, a
 * Prava session for one form attempt. This closes the common duplicate-submit
 * race while the browser has not received its session cookie yet.
 * Cross-instance guarantees still require shared durable storage.
 */
export function hasActivePravaSessionCreation(
  attemptId: unknown,
  nowMilliseconds = Date.now(),
): boolean {
  const parsedAttemptId = CheckoutAttemptIdSchema.safeParse(attemptId);

  if (!parsedAttemptId.success || !Number.isFinite(nowMilliseconds)) {
    return false;
  }

  pruneExpiredAttempts(nowMilliseconds);
  return cachedAttempts.has(parsedAttemptId.data);
}

export type CreatePravaSessionOnceInput = Readonly<{
  attemptId: string;
  checkoutJti: string;
  approvalFingerprint: string;
  create: () => Promise<PravaCheckoutAttemptState>;
  now?: () => number;
}>;

/**
 * Coalesces duplicate session-creation requests for one form attempt and
 * keeps a successful result until the provider session expires. No shopper
 * identifier or email is retained: callers supply a one-way fingerprint.
 */
export async function createPravaSessionOnce(
  input: CreatePravaSessionOnceInput,
): Promise<PravaCheckoutAttemptState> {
  const checkoutJti = CheckoutJtiSchema.safeParse(input.checkoutJti);
  const attemptId = CheckoutAttemptIdSchema.safeParse(input.attemptId);
  const approvalFingerprint = ApprovalFingerprintSchema.safeParse(
    input.approvalFingerprint,
  );
  const now = input.now ?? Date.now;
  const nowMilliseconds = now();

  if (
    !attemptId.success ||
    !checkoutJti.success ||
    !approvalFingerprint.success ||
    typeof input.create !== "function" ||
    !Number.isFinite(nowMilliseconds)
  ) {
    throw new Error("The Prava session-creation request is invalid.");
  }

  pruneExpiredAttempts(nowMilliseconds);
  const existing = cachedAttempts.get(attemptId.data);

  if (existing) {
    if (
      existing.approvalFingerprint !== approvalFingerprint.data ||
      existing.checkoutJti !== checkoutJti.data
    ) {
      throw new PravaSessionAlreadyActiveError();
    }

    return existing.operation;
  }

  if (cachedAttempts.size >= MAX_CACHED_ATTEMPTS) {
    throw new PravaSessionCapacityError();
  }

  const operation = Promise.resolve().then(input.create);
  const cached: CachedAttempt = {
    approvalFingerprint: approvalFingerprint.data,
    checkoutJti: checkoutJti.data,
    expiresAtMilliseconds:
      nowMilliseconds + PENDING_ATTEMPT_TTL_MS,
    operation,
  };
  cachedAttempts.set(attemptId.data, cached);

  try {
    const attempt = await operation;
    const providerExpiry = Date.parse(attempt.session.expiresAt);

    if (
      !Number.isFinite(providerExpiry) ||
      providerExpiry <= now()
    ) {
      throw new Error("The Prava payment session has already expired.");
    }

    cached.expiresAtMilliseconds = providerExpiry;
    return attempt;
  } catch (error) {
    if (
      isPravaClientError(error) &&
      error.operation === "create_session" &&
      error.code === "HTTP_ERROR" &&
      error.status !== undefined &&
      error.status < 500 &&
      error.status !== 408
    ) {
      // A concrete non-5xx provider rejection (including 429) proves this
      // request did not produce a usable session. It need not consume an
      // uncertainty tombstone for twenty minutes.
      cachedAttempts.delete(attemptId.data);
    }

    // Ambiguous failures can happen after the provider accepted the request.
    // Their rejected promise remains a short-lived tombstone so this process
    // never turns uncertainty into an automatic duplicate attempt.
    throw error;
  }
}
