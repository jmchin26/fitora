import { describe, expect, it, vi } from "vitest";

import {
  PravaSessionAlreadyActiveError,
  createPravaSessionOnce,
  hasActivePravaSessionCreation,
  type PravaCheckoutAttemptState,
} from "@/lib/checkout/prava-session-creation";
import { PravaClientError } from "@/lib/payments/prava";
import type { HostedSession } from "@/lib/payments/types";

const NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
const APPROVAL_FINGERPRINT =
  "fitora_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function hostedSession(
  sessionId: string,
  expiresAtMilliseconds = NOW + 10 * 60 * 1_000,
): HostedSession {
  return {
    provider: "prava",
    sessionId,
    hostedUrl:
      "https://sandbox.collect.prava.space/checkout?session_token=TEST_ONLY",
    expiresAt: new Date(expiresAtMilliseconds).toISOString(),
  };
}

function attemptState(
  sessionId: string,
  expiresAtMilliseconds = NOW + 10 * 60 * 1_000,
): PravaCheckoutAttemptState {
  const session = hostedSession(sessionId, expiresAtMilliseconds);

  return {
    session,
    hostedUrl: session.hostedUrl,
    reviewToken: `signed-review-${sessionId}`,
    sessionToken: `signed-session-${sessionId}`,
  };
}

describe("Prava session creation coalescing", () => {
  it("coalesces concurrent and lost-response retries for one checkout", async () => {
    const checkoutJti = "10000000-0000-4000-8000-000000000001";
    let release:
      | ((attempt: PravaCheckoutAttemptState) => void)
      | undefined;
    const create = vi.fn(
      () =>
        new Promise<PravaCheckoutAttemptState>((resolve) => {
          release = resolve;
        }),
    );
    const first = createPravaSessionOnce({
      attemptId: checkoutJti,
      checkoutJti,
      approvalFingerprint: APPROVAL_FINGERPRINT,
      create,
      now: () => NOW,
    });
    const second = createPravaSessionOnce({
      attemptId: checkoutJti,
      checkoutJti,
      approvalFingerprint: APPROVAL_FINGERPRINT,
      create,
      now: () => NOW,
    });

    await Promise.resolve();
    expect(create).toHaveBeenCalledOnce();
    expect(hasActivePravaSessionCreation(checkoutJti, NOW)).toBe(true);

    const attempt = attemptState("session_coalesced_001");
    release?.(attempt);
    await expect(Promise.all([first, second])).resolves.toEqual([
      attempt,
      attempt,
    ]);

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW + 1_000,
      }),
    ).resolves.toEqual(attempt);
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects a different approval identity while an attempt is active", async () => {
    const checkoutJti = "20000000-0000-4000-8000-000000000002";
    const create = vi
      .fn()
      .mockResolvedValue(attemptState("session_identity_001"));

    await createPravaSessionOnce({
      attemptId: checkoutJti,
      checkoutJti,
      approvalFingerprint: APPROVAL_FINGERPRINT,
      create,
      now: () => NOW,
    });

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint:
          "fitora_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        create,
        now: () => NOW + 1_000,
      }),
    ).rejects.toBeInstanceOf(PravaSessionAlreadyActiveError);
    expect(create).toHaveBeenCalledOnce();
  });

  it("retains ambiguous failures until their tombstone expires", async () => {
    const checkoutJti = "30000000-0000-4000-8000-000000000003";
    const create = vi
      .fn<() => Promise<PravaCheckoutAttemptState>>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(
        attemptState(
          "session_retry_001",
          NOW + 21 * 60 * 1_000,
        ),
      )
      .mockResolvedValueOnce(
        attemptState(
          "session_retry_002",
          NOW + 30 * 60 * 1_000,
        ),
      );

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW,
      }),
    ).rejects.toThrow("provider unavailable");

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW + 1_000,
      }),
    ).rejects.toThrow("provider unavailable");
    expect(create).toHaveBeenCalledOnce();

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW + 20 * 60 * 1_000 + 1,
      }),
    ).resolves.toMatchObject({
      session: { sessionId: "session_retry_001" },
    });
    expect(
      hasActivePravaSessionCreation(
        checkoutJti,
        NOW + 21 * 60 * 1_000 + 1,
      ),
    ).toBe(false);

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW + 21 * 60 * 1_000 + 1,
      }),
    ).resolves.toMatchObject({
      session: { sessionId: "session_retry_002" },
    });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("releases an authoritative provider rejection without retaining a tombstone", async () => {
    const checkoutJti = "40000000-0000-4000-8000-000000000004";
    const create = vi
      .fn<() => Promise<PravaCheckoutAttemptState>>()
      .mockRejectedValueOnce(
        new PravaClientError("HTTP_ERROR", "create_session", {
          status: 429,
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(attemptState("session_after_limit_001"));

    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      createPravaSessionOnce({
        attemptId: checkoutJti,
        checkoutJti,
        approvalFingerprint: APPROVAL_FINGERPRINT,
        create,
        now: () => NOW + 1_000,
      }),
    ).resolves.toMatchObject({
      session: { sessionId: "session_after_limit_001" },
    });
    expect(create).toHaveBeenCalledTimes(2);
  });
});
