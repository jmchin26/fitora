import { CheckoutAttemptIdSchema } from "@/lib/checkout/attempt-id";

export const CHECKOUT_COOKIE_NAMES = Object.freeze({
  review: "fitora_checkout_review",
  session: "fitora_checkout_session",
  result: "fitora_checkout_result",
} as const);

export const CHECKOUT_BROWSER_ID_COOKIE_NAME =
  "fitora_checkout_browser" as const;

export const CHECKOUT_COOKIE_MAX_AGE_SECONDS = Object.freeze({
  review: 20 * 60,
  session: 20 * 60,
  result: 60 * 60,
} as const);

export const MAX_ACTIVE_PRAVA_ATTEMPTS = 3;

export type CheckoutCookieKind = keyof typeof CHECKOUT_COOKIE_NAMES;

export function isCheckoutAttemptId(
  value: unknown,
): value is string {
  return CheckoutAttemptIdSchema.safeParse(value).success;
}

export type CheckoutCookieOptions = Readonly<{
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
  expires?: Date;
}>;

export type CheckoutCookieSpec = Readonly<{
  name: (typeof CHECKOUT_COOKIE_NAMES)[CheckoutCookieKind];
  value: string;
  options: CheckoutCookieOptions;
}>;

export interface ReadableCheckoutCookieStore {
  get(name: string): { value: string } | undefined;
}

export interface EnumerableCheckoutCookieStore
  extends ReadableCheckoutCookieStore {
  getAll(): Array<{ name: string; value: string }>;
}

export interface MutableCheckoutCookieStore
  extends ReadableCheckoutCookieStore {
  set(name: string, value: string, options: CheckoutCookieOptions): unknown;
}

type ReadableCookieTarget =
  | ReadableCheckoutCookieStore
  | Readonly<{ cookies: ReadableCheckoutCookieStore }>;
type MutableCookieTarget =
  | MutableCheckoutCookieStore
  | Readonly<{ cookies: MutableCheckoutCookieStore }>;
type EnumerableCookieTarget =
  | EnumerableCheckoutCookieStore
  | Readonly<{ cookies: EnumerableCheckoutCookieStore }>;
type Awaitable<T> = T | PromiseLike<T>;

export type CheckoutAttemptCookieSet = Readonly<{
  attemptId: string;
  values: Readonly<
    Partial<Record<CheckoutCookieKind, string>>
  >;
  presentKinds: readonly CheckoutCookieKind[];
  invalidKinds: readonly CheckoutCookieKind[];
}>;

function isProduction(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

function assertSafeCookieValue(value: string): void {
  if (
    value.length === 0 ||
    value.length > 4_096 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint < 0x21 ||
        codePoint > 0x7e ||
        character === '"' ||
        character === "," ||
        character === ";" ||
        character === "\\"
      );
    })
  ) {
    throw new Error("Checkout cookie value is invalid.");
  }
}

export function checkoutAttemptCookieName(
  kind: CheckoutCookieKind,
  attemptId: string,
): string {
  if (!isCheckoutAttemptId(attemptId)) {
    throw new Error("Checkout attempt ID is invalid.");
  }

  return `${CHECKOUT_COOKIE_NAMES[kind]}_${attemptId}`;
}

export function checkoutCookieOptions(
  kind: CheckoutCookieKind,
  nodeEnv = process.env.NODE_ENV,
): CheckoutCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(nodeEnv),
    path: "/",
    maxAge: CHECKOUT_COOKIE_MAX_AGE_SECONDS[kind],
  };
}

export function checkoutCookieSpec(
  kind: CheckoutCookieKind,
  value: string,
  nodeEnv = process.env.NODE_ENV,
): CheckoutCookieSpec {
  assertSafeCookieValue(value);

  return {
    name: CHECKOUT_COOKIE_NAMES[kind],
    value,
    options: checkoutCookieOptions(kind, nodeEnv),
  };
}

export function clearCheckoutCookieSpec(
  kind: CheckoutCookieKind,
  nodeEnv = process.env.NODE_ENV,
): CheckoutCookieSpec {
  return {
    name: CHECKOUT_COOKIE_NAMES[kind],
    value: "",
    options: {
      ...checkoutCookieOptions(kind, nodeEnv),
      maxAge: 0,
      expires: new Date(0),
    },
  };
}

function unwrapReadableCookieStore(
  target: ReadableCookieTarget,
): ReadableCheckoutCookieStore {
  return "cookies" in target ? target.cookies : target;
}

function unwrapMutableCookieStore(
  target: MutableCookieTarget,
): MutableCheckoutCookieStore {
  return "cookies" in target ? target.cookies : target;
}

function unwrapEnumerableCookieStore(
  target: EnumerableCookieTarget,
): EnumerableCheckoutCookieStore {
  return "cookies" in target ? target.cookies : target;
}

function scopedCookieKindAndAttempt(
  name: string,
):
  | Readonly<{
      kind: CheckoutCookieKind;
      attemptId: string;
    }>
  | undefined {
  for (const kind of Object.keys(
    CHECKOUT_COOKIE_NAMES,
  ) as CheckoutCookieKind[]) {
    const prefix = `${CHECKOUT_COOKIE_NAMES[kind]}_`;

    if (!name.startsWith(prefix)) {
      continue;
    }

    const attemptId = name.slice(prefix.length);

    return isCheckoutAttemptId(attemptId)
      ? { kind, attemptId }
      : undefined;
  }

  return undefined;
}

/**
 * Enumerates only attempt cookies Fitora could have generated. Values that
 * fail the normal cookie-safety check, or duplicate one kind for the same
 * attempt, are marked invalid so callers can expire the complete set.
 */
export async function listCheckoutAttemptCookieSets(
  target: Awaitable<EnumerableCookieTarget>,
): Promise<readonly CheckoutAttemptCookieSet[]> {
  const store = unwrapEnumerableCookieStore(await target);
  const grouped = new Map<
    string,
    {
      values: Partial<Record<CheckoutCookieKind, string>>;
      presentKinds: Set<CheckoutCookieKind>;
      invalidKinds: Set<CheckoutCookieKind>;
    }
  >();

  for (const cookie of store.getAll()) {
    const scoped = scopedCookieKindAndAttempt(cookie.name);

    if (!scoped) {
      continue;
    }

    const group = grouped.get(scoped.attemptId) ?? {
      values: {},
      presentKinds: new Set<CheckoutCookieKind>(),
      invalidKinds: new Set<CheckoutCookieKind>(),
    };

    if (group.presentKinds.has(scoped.kind)) {
      group.invalidKinds.add(scoped.kind);
    }

    group.presentKinds.add(scoped.kind);

    try {
      assertSafeCookieValue(cookie.value);

      if (group.values[scoped.kind] === undefined) {
        group.values[scoped.kind] = cookie.value;
      }
    } catch {
      group.invalidKinds.add(scoped.kind);
    }

    grouped.set(scoped.attemptId, group);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([attemptId, group]) => ({
      attemptId,
      values: group.values,
      presentKinds: [...group.presentKinds],
      invalidKinds: [...group.invalidKinds],
    }));
}

export async function readCheckoutCookie(
  target: Awaitable<ReadableCookieTarget>,
  kind: CheckoutCookieKind,
): Promise<string | undefined> {
  const store = unwrapReadableCookieStore(await target);
  const value = store.get(CHECKOUT_COOKIE_NAMES[kind])?.value;

  if (value === undefined) {
    return undefined;
  }

  try {
    assertSafeCookieValue(value);
    return value;
  } catch {
    return undefined;
  }
}

export async function readCheckoutBrowserId(
  target: Awaitable<ReadableCookieTarget>,
): Promise<string | undefined> {
  const store = unwrapReadableCookieStore(await target);
  const parsed = CheckoutAttemptIdSchema.safeParse(
    store.get(CHECKOUT_BROWSER_ID_COOKIE_NAME)?.value,
  );

  return parsed.success ? parsed.data : undefined;
}

export async function setCheckoutBrowserId(
  target: Awaitable<MutableCookieTarget>,
  browserId: string,
  nodeEnv = process.env.NODE_ENV,
): Promise<void> {
  const parsed = CheckoutAttemptIdSchema.safeParse(browserId);

  if (!parsed.success) {
    throw new Error("Checkout browser ID is invalid.");
  }

  const store = unwrapMutableCookieStore(await target);
  store.set(
    CHECKOUT_BROWSER_ID_COOKIE_NAME,
    parsed.data,
    checkoutCookieOptions("result", nodeEnv),
  );
}

export async function setCheckoutCookie(
  target: Awaitable<MutableCookieTarget>,
  kind: CheckoutCookieKind,
  value: string,
  nodeEnv = process.env.NODE_ENV,
): Promise<void> {
  const store = unwrapMutableCookieStore(await target);
  const spec = checkoutCookieSpec(kind, value, nodeEnv);
  store.set(spec.name, spec.value, spec.options);
}

export async function clearCheckoutCookie(
  target: Awaitable<MutableCookieTarget>,
  kind: CheckoutCookieKind,
  nodeEnv = process.env.NODE_ENV,
): Promise<void> {
  const store = unwrapMutableCookieStore(await target);
  const spec = clearCheckoutCookieSpec(kind, nodeEnv);
  store.set(spec.name, spec.value, spec.options);
}

export async function readCheckoutAttemptCookie(
  target: Awaitable<ReadableCookieTarget>,
  kind: CheckoutCookieKind,
  attemptId: string,
): Promise<string | undefined> {
  const store = unwrapReadableCookieStore(await target);
  const value = store.get(
    checkoutAttemptCookieName(kind, attemptId),
  )?.value;

  if (value === undefined) {
    return undefined;
  }

  try {
    assertSafeCookieValue(value);
    return value;
  } catch {
    return undefined;
  }
}

export async function setCheckoutAttemptCookie(
  target: Awaitable<MutableCookieTarget>,
  kind: CheckoutCookieKind,
  attemptId: string,
  value: string,
  nodeEnv = process.env.NODE_ENV,
): Promise<void> {
  assertSafeCookieValue(value);
  const store = unwrapMutableCookieStore(await target);
  store.set(
    checkoutAttemptCookieName(kind, attemptId),
    value,
    checkoutCookieOptions(kind, nodeEnv),
  );
}

export async function clearCheckoutAttemptCookie(
  target: Awaitable<MutableCookieTarget>,
  kind: CheckoutCookieKind,
  attemptId: string,
  nodeEnv = process.env.NODE_ENV,
): Promise<void> {
  const store = unwrapMutableCookieStore(await target);
  store.set(
    checkoutAttemptCookieName(kind, attemptId),
    "",
    {
      ...checkoutCookieOptions(kind, nodeEnv),
      maxAge: 0,
      expires: new Date(0),
    },
  );
}
