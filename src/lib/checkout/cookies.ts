export const CHECKOUT_COOKIE_NAMES = Object.freeze({
  review: "fitora_checkout_review",
  session: "fitora_checkout_session",
  result: "fitora_checkout_result",
} as const);

export const CHECKOUT_COOKIE_MAX_AGE_SECONDS = Object.freeze({
  review: 10 * 60,
  session: 20 * 60,
  result: 60 * 60,
} as const);

export type CheckoutCookieKind = keyof typeof CHECKOUT_COOKIE_NAMES;

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
type Awaitable<T> = T | PromiseLike<T>;

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
