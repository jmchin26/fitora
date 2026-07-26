import { afterEach, describe, expect, it } from "vitest";

import {
  PRAVA_BROWSER_LEASE_MILLISECONDS,
  releasePravaBrowserAttempt,
  reservePravaBrowserAttempt,
} from "@/lib/checkout/prava-browser-lease";

const ATTEMPT_A = "a0000000-0000-4000-8000-00000000000a";
const ATTEMPT_B = "b0000000-0000-4000-8000-00000000000b";

afterEach(() => {
  window.localStorage.clear();
});

describe("Prava browser attempt lease", () => {
  it("allows one attempt, remains idempotent for it, and blocks another", async () => {
    expect(
      await reservePravaBrowserAttempt(ATTEMPT_A, {
        nowMilliseconds: 1_000,
        storage: window.localStorage,
      }),
    ).toBe(true);
    expect(
      await reservePravaBrowserAttempt(ATTEMPT_A, {
        nowMilliseconds: 2_000,
        storage: window.localStorage,
      }),
    ).toBe(true);
    expect(
      await reservePravaBrowserAttempt(ATTEMPT_B, {
        nowMilliseconds: 2_000,
        storage: window.localStorage,
      }),
    ).toBe(false);
  });

  it("releases only the owning attempt and replaces an expired lease", async () => {
    await reservePravaBrowserAttempt(ATTEMPT_A, {
      nowMilliseconds: 1_000,
      storage: window.localStorage,
    });
    releasePravaBrowserAttempt(ATTEMPT_B, window.localStorage);
    expect(
      await reservePravaBrowserAttempt(ATTEMPT_B, {
        nowMilliseconds: 2_000,
        storage: window.localStorage,
      }),
    ).toBe(false);

    expect(
      await reservePravaBrowserAttempt(ATTEMPT_B, {
        nowMilliseconds:
          1_000 + PRAVA_BROWSER_LEASE_MILLISECONDS + 1,
        storage: window.localStorage,
      }),
    ).toBe(true);
    releasePravaBrowserAttempt(ATTEMPT_B, window.localStorage);
    expect(window.localStorage.length).toBe(0);
  });

  it("fails closed for an invalid attempt locator", async () => {
    expect(
      await reservePravaBrowserAttempt("NOT-A-UUID", {
        nowMilliseconds: 1_000,
        storage: window.localStorage,
      }),
    ).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });
});
