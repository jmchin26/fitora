import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";

export const PRAVA_BROWSER_LEASE_KEY =
  "fitora_prava_checkout_attempt_v1";
export const PRAVA_BROWSER_LEASE_MILLISECONDS = 20 * 60 * 1_000;

type BrowserLease = Readonly<{
  attemptId: string;
  expiresAtMilliseconds: number;
}>;

type LockManagerLike = Readonly<{
  request<T>(
    name: string,
    options: Readonly<{ ifAvailable: true; mode: "exclusive" }>,
    callback: (lock: unknown | null) => T | PromiseLike<T>,
  ): Promise<T>;
}>;

function readLease(storage: Storage): BrowserLease | undefined {
  try {
    const raw = storage.getItem(PRAVA_BROWSER_LEASE_KEY);

    if (!raw || raw.length > 256) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attemptId = CheckoutAttemptIdSchema.safeParse(
      parsed.attemptId,
    );
    const expiresAtMilliseconds = parsed.expiresAtMilliseconds;

    if (
      !attemptId.success ||
      !Number.isSafeInteger(expiresAtMilliseconds) ||
      Number(expiresAtMilliseconds) <= 0
    ) {
      return undefined;
    }

    return {
      attemptId: attemptId.data,
      expiresAtMilliseconds: Number(expiresAtMilliseconds),
    };
  } catch {
    return undefined;
  }
}

function reserveInStorage(
  storage: Storage,
  attemptId: string,
  nowMilliseconds: number,
): boolean {
  const existing = readLease(storage);

  if (
    existing &&
    existing.expiresAtMilliseconds > nowMilliseconds &&
    existing.attemptId !== attemptId
  ) {
    return false;
  }

  try {
    storage.setItem(
      PRAVA_BROWSER_LEASE_KEY,
      JSON.stringify({
        attemptId,
        expiresAtMilliseconds:
          nowMilliseconds + PRAVA_BROWSER_LEASE_MILLISECONDS,
      } satisfies BrowserLease),
    );
    return readLease(storage)?.attemptId === attemptId;
  } catch {
    // Storage may be disabled. Server-side throttles and the deployment WAF
    // remain authoritative; do not make checkout unusable in this browser.
    return true;
  }
}

/**
 * Serializes the localStorage check with the Web Locks API when available.
 * The persisted lease blocks a second cooperative tab until the provider
 * attempt reaches a terminal state or its maximum session window elapses.
 */
export async function reservePravaBrowserAttempt(
  attemptId: string,
  options: Readonly<{
    locks?: LockManagerLike;
    nowMilliseconds?: number;
    storage?: Storage;
  }> = {},
): Promise<boolean> {
  const parsedAttemptId = CheckoutAttemptIdSchema.safeParse(attemptId);

  if (!parsedAttemptId.success) {
    return false;
  }

  const storage = options.storage ?? window.localStorage;
  const nowMilliseconds = options.nowMilliseconds ?? Date.now();
  const reserve = () =>
    reserveInStorage(storage, parsedAttemptId.data, nowMilliseconds);
  const locks =
    options.locks ??
    (navigator as Navigator & { locks?: LockManagerLike }).locks;

  if (!locks) {
    return reserve();
  }

  try {
    return await locks.request(
      "fitora-prava-checkout-creation",
      { ifAvailable: true, mode: "exclusive" },
      (lock) => (lock ? reserve() : false),
    );
  } catch {
    return reserve();
  }
}

export function releasePravaBrowserAttempt(
  attemptId: string,
  storage: Storage = window.localStorage,
): void {
  if (!CheckoutAttemptIdSchema.safeParse(attemptId).success) {
    return;
  }

  try {
    if (readLease(storage)?.attemptId === attemptId) {
      storage.removeItem(PRAVA_BROWSER_LEASE_KEY);
    }
  } catch {
    // Storage access is best effort; server-side controls remain in force.
  }
}
