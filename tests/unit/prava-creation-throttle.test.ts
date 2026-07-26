import { describe, expect, it } from "vitest";

import {
  PravaCreationRateLimitError,
  PravaCreationThrottle,
  derivePravaCreationClientKey,
} from "@/lib/checkout/prava-creation-throttle";

const SIGNING_SECRET =
  "fitora-prava-creation-throttle-test-signing-secret";

function attempt(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${index
    .toString(16)
    .padStart(12, "0")}`;
}

function review(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-9000-${index
    .toString(16)
    .padStart(12, "0")}`;
}

describe("Prava creation throttle", () => {
  it("does not charge a duplicate delivery of the same form attempt twice", () => {
    const throttle = new PravaCreationThrottle({
      maxAttemptsPerReview: 1,
    });

    throttle.consume({
      attemptId: attempt(1),
      checkoutJti: review(1),
      nowMilliseconds: 1_000,
    });
    throttle.consume({
      attemptId: attempt(1),
      checkoutJti: review(1),
      nowMilliseconds: 2_000,
    });

    expect(() =>
      throttle.consume({
        attemptId: attempt(2),
        checkoutJti: review(1),
        nowMilliseconds: 3_000,
      }),
    ).toThrow(PravaCreationRateLimitError);
  });

  it("limits distinct attempts for one signed review", () => {
    const throttle = new PravaCreationThrottle({
      maxAttemptsPerReview: 3,
    });

    for (let index = 1; index <= 3; index += 1) {
      throttle.consume({
        attemptId: attempt(index),
        checkoutJti: review(1),
        nowMilliseconds: 1_000,
      });
    }

    expect(() =>
      throttle.consume({
        attemptId: attempt(4),
        checkoutJti: review(1),
        nowMilliseconds: 1_000,
      }),
    ).toThrow(PravaCreationRateLimitError);
  });

  it("atomically reserves only the remaining aggregate browser capacity", () => {
    const throttle = new PravaCreationThrottle({
      maxActiveAttempts: 3,
      maxAttemptsPerReview: 3,
    });
    const activeAttemptIds = new Set([attempt(1), attempt(2)]);
    const browserId = "f0000000-0000-4000-8000-00000000000f";

    throttle.consume({
      activeAttemptIds,
      attemptId: attempt(3),
      browserId,
      checkoutJti: review(1),
      nowMilliseconds: 1_000,
    });

    for (const nextAttempt of [attempt(4), attempt(5)]) {
      expect(() =>
        throttle.consume({
          activeAttemptIds,
          attemptId: nextAttempt,
          browserId,
          checkoutJti:
            nextAttempt === attempt(4) ? review(2) : review(3),
          nowMilliseconds: 1_000,
        }),
      ).toThrow(PravaCreationRateLimitError);
    }
  });

  it("limits one production client across separate reviews", () => {
    const throttle = new PravaCreationThrottle({
      maxAttemptsPerClient: 2,
    });
    const clientKey = "client_key_for_throttle_tests";

    throttle.consume({
      attemptId: attempt(1),
      checkoutJti: review(1),
      clientKey,
      nowMilliseconds: 1_000,
    });
    throttle.consume({
      attemptId: attempt(2),
      checkoutJti: review(2),
      clientKey,
      nowMilliseconds: 1_000,
    });

    expect(() =>
      throttle.consume({
        attemptId: attempt(3),
        checkoutJti: review(3),
        clientKey,
        nowMilliseconds: 1_000,
      }),
    ).toThrow(PravaCreationRateLimitError);
  });

  it("releases expired buckets and bounds bucket allocation", () => {
    const expiring = new PravaCreationThrottle({
      maxAttemptsPerReview: 1,
      windowMilliseconds: 1_000,
    });
    expiring.consume({
      attemptId: attempt(1),
      checkoutJti: review(1),
      nowMilliseconds: 1_000,
    });
    expect(() =>
      expiring.consume({
        attemptId: attempt(2),
        checkoutJti: review(1),
        nowMilliseconds: 2_001,
      }),
    ).not.toThrow();

    const bounded = new PravaCreationThrottle({ maxBuckets: 2 });
    bounded.consume({
      attemptId: attempt(3),
      checkoutJti: review(3),
      nowMilliseconds: 1_000,
    });
    bounded.consume({
      attemptId: attempt(4),
      checkoutJti: review(4),
      nowMilliseconds: 1_000,
    });
    expect(() =>
      bounded.consume({
        attemptId: attempt(5),
        checkoutJti: review(5),
        nowMilliseconds: 1_000,
      }),
    ).toThrow(PravaCreationRateLimitError);
  });

  it("releases terminal browser and review reservations", () => {
    const throttle = new PravaCreationThrottle({
      maxActiveAttempts: 1,
      maxAttemptsPerReview: 1,
    });
    const browserId = "f0000000-0000-4000-8000-00000000000f";

    throttle.consume({
      attemptId: attempt(1),
      browserId,
      checkoutJti: review(1),
      nowMilliseconds: 1_000,
    });
    throttle.release({
      attemptId: attempt(1),
      browserId,
      checkoutJti: review(1),
    });

    expect(() =>
      throttle.consume({
        attemptId: attempt(2),
        browserId,
        checkoutJti: review(2),
        nowMilliseconds: 2_000,
      }),
    ).not.toThrow();
  });

  it("hashes only a trusted Vercel production client address", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
    });
    const productionKey = derivePravaCreationClientKey(
      headers,
      SIGNING_SECRET,
      { isVercel: true, nodeEnv: "production" },
    );
    const sameFirstAddress = derivePravaCreationClientKey(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.10" }),
      SIGNING_SECRET,
      { isVercel: true, nodeEnv: "production" },
    );

    expect(productionKey).toBe(sameFirstAddress);
    expect(productionKey).not.toContain("203.0.113.10");
    expect(
      derivePravaCreationClientKey(headers, SIGNING_SECRET, {
        isVercel: true,
        nodeEnv: "test",
      }),
    ).toBeUndefined();
    expect(
      derivePravaCreationClientKey(headers, SIGNING_SECRET, {
        isVercel: false,
        nodeEnv: "production",
      }),
    ).not.toBe(productionKey);
  });
});
