import { createHmac } from "node:crypto";

import { z } from "zod";

import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";
import { MAX_ACTIVE_PRAVA_ATTEMPTS } from "@/lib/checkout/cookies";

export const PRAVA_CREATION_RATE_WINDOW_SECONDS = 10 * 60;
export const PRAVA_BROWSER_RESERVATION_SECONDS = 20 * 60;
export const PRAVA_CREATION_MAX_ATTEMPTS_PER_REVIEW = 3;
export const PRAVA_CREATION_MAX_ATTEMPTS_PER_CLIENT = 20;

const CheckoutJtiSchema = z.string().uuid();
const ClientKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

type AttemptBucket = {
  attemptIds: Set<string>;
  resetsAtMilliseconds: number;
};

type PravaCreationThrottleOptions = Readonly<{
  browserReservationMilliseconds?: number;
  maxActiveAttempts?: number;
  maxBuckets?: number;
  maxAttemptsPerClient?: number;
  maxAttemptsPerReview?: number;
  windowMilliseconds?: number;
}>;

export type ConsumePravaCreationPermitInput = Readonly<{
  activeAttemptIds?: ReadonlySet<string> | readonly string[];
  attemptId: string;
  browserId?: string;
  checkoutJti: string;
  clientKey?: string;
  nowMilliseconds?: number;
}>;

export class PravaCreationRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Prava session creation is temporarily rate limited.");
    this.name = "PravaCreationRateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

/**
 * Small in-process guard for accidental bursts and basic abuse containment.
 * A deployment-level rate limit remains authoritative across serverless
 * instances; this bounded map never stores an IP address or customer data.
 */
export class PravaCreationThrottle {
  private readonly browserReservationMilliseconds: number;
  private readonly buckets = new Map<string, AttemptBucket>();
  private readonly maxActiveAttempts: number;
  private readonly maxBuckets: number;
  private readonly maxAttemptsPerClient: number;
  private readonly maxAttemptsPerReview: number;
  private readonly windowMilliseconds: number;

  constructor(options: PravaCreationThrottleOptions = {}) {
    this.browserReservationMilliseconds =
      options.browserReservationMilliseconds ??
      PRAVA_BROWSER_RESERVATION_SECONDS * 1_000;
    this.maxActiveAttempts =
      options.maxActiveAttempts ?? MAX_ACTIVE_PRAVA_ATTEMPTS;
    this.maxBuckets = options.maxBuckets ?? 1_024;
    this.maxAttemptsPerClient =
      options.maxAttemptsPerClient ??
      PRAVA_CREATION_MAX_ATTEMPTS_PER_CLIENT;
    this.maxAttemptsPerReview =
      options.maxAttemptsPerReview ??
      PRAVA_CREATION_MAX_ATTEMPTS_PER_REVIEW;
    this.windowMilliseconds =
      options.windowMilliseconds ??
      PRAVA_CREATION_RATE_WINDOW_SECONDS * 1_000;

    if (
      !Number.isSafeInteger(this.browserReservationMilliseconds) ||
      this.browserReservationMilliseconds < 1_000 ||
      !Number.isSafeInteger(this.maxActiveAttempts) ||
      this.maxActiveAttempts < 1 ||
      !Number.isSafeInteger(this.maxBuckets) ||
      this.maxBuckets < 2 ||
      !Number.isSafeInteger(this.maxAttemptsPerClient) ||
      this.maxAttemptsPerClient < 1 ||
      !Number.isSafeInteger(this.maxAttemptsPerReview) ||
      this.maxAttemptsPerReview < 1 ||
      !Number.isSafeInteger(this.windowMilliseconds) ||
      this.windowMilliseconds < 1_000
    ) {
      throw new Error("Prava creation-throttle configuration is invalid.");
    }
  }

  private prune(nowMilliseconds: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAtMilliseconds <= nowMilliseconds) {
        this.buckets.delete(key);
      }
    }
  }

  consume(input: ConsumePravaCreationPermitInput): void {
    const attemptId = CheckoutAttemptIdSchema.safeParse(input.attemptId);
    const browserId =
      input.browserId === undefined
        ? undefined
        : CheckoutAttemptIdSchema.safeParse(input.browserId);
    const checkoutJti = CheckoutJtiSchema.safeParse(input.checkoutJti);
    const clientKey =
      input.clientKey === undefined
        ? undefined
        : ClientKeySchema.safeParse(input.clientKey);
    const nowMilliseconds = input.nowMilliseconds ?? Date.now();
    const activeAttemptIds = new Set<string>();

    for (const activeAttemptId of input.activeAttemptIds ?? []) {
      const parsedActiveAttemptId =
        CheckoutAttemptIdSchema.safeParse(activeAttemptId);

      if (!parsedActiveAttemptId.success) {
        throw new Error("The Prava creation-throttle input is invalid.");
      }

      activeAttemptIds.add(parsedActiveAttemptId.data);
    }

    if (
      !attemptId.success ||
      (browserId !== undefined && !browserId.success) ||
      !checkoutJti.success ||
      (clientKey !== undefined && !clientKey.success) ||
      !Number.isFinite(nowMilliseconds)
    ) {
      throw new Error("The Prava creation-throttle input is invalid.");
    }

    this.prune(nowMilliseconds);
    const reviewKey = `review:${checkoutJti.data}`;
    const reviewBucket = this.buckets.get(reviewKey);
    const browserKey = browserId?.success
      ? `browser:${browserId.data}`
      : undefined;
    const aggregateBucket = browserKey
      ? this.buckets.get(browserKey)
      : reviewBucket;
    const aggregateAttemptIds = new Set(activeAttemptIds);

    for (const reservedAttemptId of aggregateBucket?.attemptIds ?? []) {
      aggregateAttemptIds.add(reservedAttemptId);
    }

    if (
      !aggregateAttemptIds.has(attemptId.data) &&
      aggregateAttemptIds.size >= this.maxActiveAttempts
    ) {
      throw new PravaCreationRateLimitError(
        aggregateBucket
          ? (aggregateBucket.resetsAtMilliseconds - nowMilliseconds) /
              1_000
          : this.browserReservationMilliseconds / 1_000,
      );
    }

    const specifications = [
      {
        key: reviewKey,
        limit: this.maxAttemptsPerReview,
        windowMilliseconds: this.windowMilliseconds,
      },
      ...(browserKey
        ? [
            {
              key: browserKey,
              limit: this.maxActiveAttempts,
              windowMilliseconds:
                this.browserReservationMilliseconds,
            },
          ]
        : []),
      ...(clientKey?.success
        ? [
            {
              key: `client:${clientKey.data}`,
              limit: this.maxAttemptsPerClient,
              windowMilliseconds: this.windowMilliseconds,
            },
          ]
        : []),
    ];
    const missingBuckets = specifications.filter(
      ({ key }) => !this.buckets.has(key),
    ).length;

    if (this.buckets.size + missingBuckets > this.maxBuckets) {
      throw new PravaCreationRateLimitError(
        this.windowMilliseconds / 1_000,
      );
    }

    for (const { key, limit } of specifications) {
      const bucket = this.buckets.get(key);

      if (
        bucket &&
        !bucket.attemptIds.has(attemptId.data) &&
        bucket.attemptIds.size >= limit
      ) {
        throw new PravaCreationRateLimitError(
          (bucket.resetsAtMilliseconds - nowMilliseconds) / 1_000,
        );
      }
    }

    for (const { key, windowMilliseconds } of specifications) {
      const bucket = this.buckets.get(key) ?? {
        attemptIds: new Set<string>(),
        resetsAtMilliseconds:
          nowMilliseconds + windowMilliseconds,
      };
      bucket.attemptIds.add(attemptId.data);
      this.buckets.set(key, bucket);
    }
  }

  release(
    input: Readonly<{
      attemptId: string;
      browserId?: string;
      checkoutJti?: string;
    }>,
  ): void {
    const attemptId = CheckoutAttemptIdSchema.safeParse(input.attemptId);
    const browserId =
      input.browserId === undefined
        ? undefined
        : CheckoutAttemptIdSchema.safeParse(input.browserId);
    const checkoutJti =
      input.checkoutJti === undefined
        ? undefined
        : CheckoutJtiSchema.safeParse(input.checkoutJti);

    if (
      !attemptId.success ||
      (browserId !== undefined && !browserId.success) ||
      (checkoutJti !== undefined && !checkoutJti.success)
    ) {
      return;
    }

    const keys = [
      ...(browserId?.success
        ? [`browser:${browserId.data}`]
        : []),
      ...(checkoutJti?.success
        ? [`review:${checkoutJti.data}`]
        : []),
    ];

    for (const key of keys) {
      const bucket = this.buckets.get(key);

      if (!bucket) {
        continue;
      }

      bucket.attemptIds.delete(attemptId.data);

      if (bucket.attemptIds.size === 0) {
        this.buckets.delete(key);
      }
    }
  }
}

type ClientKeyOptions = Readonly<{
  isVercel?: boolean;
  nodeEnv?: string;
}>;

/**
 * Uses Vercel's platform-set forwarding header only on Vercel production.
 * Other production hosts share a conservative anonymous bucket until an
 * equivalent trusted proxy boundary is implemented.
 */
export function derivePravaCreationClientKey(
  headers: Pick<Headers, "get">,
  signingSecret: string,
  options: ClientKeyOptions = {},
): string | undefined {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  if (nodeEnv !== "production") {
    return undefined;
  }

  const isVercel = options.isVercel ?? process.env.VERCEL === "1";
  const forwarded = isVercel
    ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  const source =
    forwarded &&
    forwarded.length <= 128 &&
    [...forwarded].every((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point >= 0x21 && point <= 0x7e;
    })
      ? forwarded
      : "unidentified-production-client";

  return createHmac("sha256", signingSecret)
    .update(`fitora.prava.creation.v1:${source}`, "utf8")
    .digest("base64url");
}

export const pravaCreationThrottle = new PravaCreationThrottle();
