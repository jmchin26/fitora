import { describe, expect, it } from "vitest";

import {
  CHECKOUT_BROWSER_ID_COOKIE_NAME,
  CHECKOUT_COOKIE_MAX_AGE_SECONDS,
  CHECKOUT_COOKIE_NAMES,
  MAX_ACTIVE_PRAVA_ATTEMPTS,
  checkoutCookieSpec,
  clearCheckoutAttemptCookie,
  clearCheckoutCookie,
  clearCheckoutCookieSpec,
  isCheckoutAttemptId,
  listCheckoutAttemptCookieSets,
  readCheckoutBrowserId,
  readCheckoutAttemptCookie,
  readCheckoutCookie,
  setCheckoutAttemptCookie,
  setCheckoutBrowserId,
  setCheckoutCookie,
  type CheckoutCookieOptions,
} from "@/lib/checkout/cookies";

class MemoryCookieStore {
  readonly values = new Map<string, string>();
  readonly writes: Array<{
    name: string;
    value: string;
    options: CheckoutCookieOptions;
  }> = [];

  get(name: string): { value: string } | undefined {
    const value = this.values.get(name);
    return value === undefined ? undefined : { value };
  }

  getAll(): Array<{ name: string; value: string }> {
    return [...this.values].map(([name, value]) => ({
      name,
      value,
    }));
  }

  set(name: string, value: string, options: CheckoutCookieOptions): void {
    this.writes.push({ name, value, options });
    if (options.maxAge === 0) {
      this.values.delete(name);
      return;
    }
    this.values.set(name, value);
  }
}

const cookieKinds = ["review", "session", "result"] as const;
const ATTEMPT_A = "70000000-0000-4000-8000-000000000007";
const ATTEMPT_B = "80000000-0000-4000-8000-000000000008";

describe("checkout cookie specifications", () => {
  it("uses fixed, distinct, non-sensitive names", () => {
    expect(Object.keys(CHECKOUT_COOKIE_NAMES)).toEqual(cookieKinds);
    expect(new Set(Object.values(CHECKOUT_COOKIE_NAMES))).toHaveLength(3);
    expect(Object.isFrozen(CHECKOUT_COOKIE_NAMES)).toBe(true);
    expect(Object.values(CHECKOUT_COOKIE_NAMES).join(" ")).not.toMatch(
      /token|secret|cvv|expiry/i,
    );
  });

  it.each(cookieKinds)(
    "keeps the %s cookie HttpOnly, Lax, root-scoped, and bounded locally",
    (kind) => {
      const spec = checkoutCookieSpec(kind, `${kind}-signed-value`, "test");

      expect(spec).toEqual({
        name: CHECKOUT_COOKIE_NAMES[kind],
        value: `${kind}-signed-value`,
        options: {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          path: "/",
          maxAge: CHECKOUT_COOKIE_MAX_AGE_SECONDS[kind],
        },
      });
      expect(spec.options.maxAge).toBeGreaterThan(0);
      expect(spec.options.maxAge).toBeLessThanOrEqual(60 * 60);
    },
  );

  it.each(cookieKinds)("sets Secure for the %s cookie in production", (kind) => {
    expect(
      checkoutCookieSpec(kind, `${kind}-signed-value`, "production").options,
    ).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });

  it("keeps the result cookie HttpOnly", () => {
    expect(
      checkoutCookieSpec("result", "sanitized-result", "production").options
        .httpOnly,
    ).toBe(true);
  });

  it.each(cookieKinds)(
    "clears %s with the same security scope and immediate expiry",
    (kind) => {
      const setSpec = checkoutCookieSpec(kind, "opaque-value", "production");
      const clearSpec = clearCheckoutCookieSpec(kind, "production");

      expect(clearSpec.name).toBe(setSpec.name);
      expect(clearSpec.value).toBe("");
      expect(clearSpec.options).toMatchObject({
        httpOnly: setSpec.options.httpOnly,
        sameSite: setSpec.options.sameSite,
        secure: setSpec.options.secure,
        path: setSpec.options.path,
        maxAge: 0,
      });
      expect(clearSpec.options.expires?.getTime()).toBe(0);
    },
  );

  it.each(["", "contains space", "contains;separator", "x".repeat(4_097)])(
    "rejects unsafe cookie value without echoing it: %j",
    (value) => {
      expect(() => checkoutCookieSpec("review", value, "test")).toThrow(
        "Checkout cookie value is invalid.",
      );
    },
  );
});

describe("checkout cookie store helpers", () => {
  it("stores only a strict opaque browser scope without customer data", async () => {
    const store = new MemoryCookieStore();

    await setCheckoutBrowserId(
      store,
      ATTEMPT_A,
      "production",
    );

    await expect(readCheckoutBrowserId(store)).resolves.toBe(
      ATTEMPT_A,
    );
    expect(store.writes[0]).toMatchObject({
      name: CHECKOUT_BROWSER_ID_COOKIE_NAME,
      value: ATTEMPT_A,
      options: {
        httpOnly: true,
        maxAge: 3_600,
        sameSite: "lax",
        secure: true,
      },
    });
    await expect(
      setCheckoutBrowserId(store, "NOT-A-UUID"),
    ).rejects.toThrow("Checkout browser ID is invalid.");
  });

  it("enumerates only generated attempt sets and marks unsafe values", async () => {
    const store = new MemoryCookieStore();
    store.values.set(
      `${CHECKOUT_COOKIE_NAMES.review}_${ATTEMPT_A}`,
      "signed-review-a",
    );
    store.values.set(
      `${CHECKOUT_COOKIE_NAMES.session}_${ATTEMPT_A}`,
      "x".repeat(4_097),
    );
    store.values.set(
      `${CHECKOUT_COOKIE_NAMES.result}_${ATTEMPT_B}`,
      "signed-terminal-b",
    );
    store.values.set(CHECKOUT_COOKIE_NAMES.review, "global-review");
    store.values.set(
      `${CHECKOUT_COOKIE_NAMES.review}_not-a-valid-attempt`,
      "ignored",
    );

    await expect(
      listCheckoutAttemptCookieSets(store),
    ).resolves.toEqual([
      {
        attemptId: ATTEMPT_A,
        values: { review: "signed-review-a" },
        presentKinds: ["review", "session"],
        invalidKinds: ["session"],
      },
      {
        attemptId: ATTEMPT_B,
        values: { result: "signed-terminal-b" },
        presentKinds: ["result"],
        invalidKinds: [],
      },
    ]);
    expect(MAX_ACTIVE_PRAVA_ATTEMPTS).toBe(3);
  });

  it("sets and reads through a NextResponse-like cookies property", async () => {
    const store = new MemoryCookieStore();
    const responseLike = { cookies: store };

    await setCheckoutCookie(
      responseLike,
      "review",
      "signed-review-value",
      "test",
    );

    await expect(readCheckoutCookie(responseLike, "review")).resolves.toBe(
      "signed-review-value",
    );
    expect(store.writes[0]?.options.httpOnly).toBe(true);
  });

  it("supports an async cookies() store and clears with scoped options", async () => {
    const store = new MemoryCookieStore();
    const asyncStore = Promise.resolve(store);

    await setCheckoutCookie(
      asyncStore,
      "session",
      "opaque-session-id",
      "production",
    );
    await expect(readCheckoutCookie(asyncStore, "session")).resolves.toBe(
      "opaque-session-id",
    );

    await clearCheckoutCookie(asyncStore, "session", "production");
    await expect(readCheckoutCookie(asyncStore, "session")).resolves.toBe(
      undefined,
    );
    expect(store.writes.at(-1)?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  });

  it("treats malformed stored values as absent", async () => {
    const store = new MemoryCookieStore();
    store.values.set(CHECKOUT_COOKIE_NAMES.result, "unsafe;value");

    await expect(readCheckoutCookie(store, "result")).resolves.toBeUndefined();
  });

  it.each(cookieKinds)("maps helper kind %s to its fixed name", async (kind) => {
    const store = new MemoryCookieStore();
    await setCheckoutCookie(store, kind, `${kind}-value`, "test");

    expect(store.writes.at(-1)?.name).toBe(CHECKOUT_COOKIE_NAMES[kind]);
  });

  it("isolates short-lived state by strict opaque checkout attempt ID", async () => {
    const store = new MemoryCookieStore();

    await setCheckoutAttemptCookie(
      store,
      "session",
      ATTEMPT_A,
      "signed-session-a",
      "production",
    );
    await setCheckoutAttemptCookie(
      store,
      "session",
      ATTEMPT_B,
      "signed-session-b",
      "production",
    );

    await expect(
      readCheckoutAttemptCookie(store, "session", ATTEMPT_A),
    ).resolves.toBe("signed-session-a");
    await expect(
      readCheckoutAttemptCookie(store, "session", ATTEMPT_B),
    ).resolves.toBe("signed-session-b");
    expect(store.writes[0]?.name).not.toBe(store.writes[1]?.name);
    expect(store.writes[0]).toMatchObject({
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      },
    });

    await clearCheckoutAttemptCookie(
      store,
      "session",
      ATTEMPT_A,
      "production",
    );
    await expect(
      readCheckoutAttemptCookie(store, "session", ATTEMPT_A),
    ).resolves.toBeUndefined();
    await expect(
      readCheckoutAttemptCookie(store, "session", ATTEMPT_B),
    ).resolves.toBe("signed-session-b");
  });

  it.each([
    "",
    "../callback",
    "70000000-0000-4000-8000-000000000007_suffix",
    "70000000-0000-0000-0000-000000000007",
    "70000000-0000-4000-8000-000000000007; injected=true",
  ])("rejects an unsafe attempt locator %j", async (attemptId) => {
    const store = new MemoryCookieStore();

    expect(isCheckoutAttemptId(attemptId)).toBe(false);
    await expect(
      setCheckoutAttemptCookie(
        store,
        "review",
        attemptId,
        "signed-value",
      ),
    ).rejects.toThrow("Checkout attempt ID is invalid.");
    await expect(
      readCheckoutAttemptCookie(store, "review", attemptId),
    ).rejects.toThrow("Checkout attempt ID is invalid.");
    expect(store.writes).toHaveLength(0);
  });
});
