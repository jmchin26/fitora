import type { CheckoutTokenClaims } from "@/lib/checkout/token";
import {
  compareCheckoutClaimsToOrder,
  verifyCheckoutToken,
  type VerifyCheckoutTokenOptions,
} from "@/lib/checkout/token";
import {
  verifyCheckoutOrder,
  type CheckoutOrderIssue,
  type VerifiedOrder,
} from "@/lib/checkout/order";

export type ResolvedCheckoutState =
  | {
      ok: true;
      claims: CheckoutTokenClaims;
      order: VerifiedOrder;
    }
  | {
      ok: false;
      reason:
        | "MISSING"
        | "INVALID"
        | "EXPIRED"
        | "NOT_YET_VALID"
        | "ORDER_UNAVAILABLE"
        | "ORDER_CHANGED";
      issues?: readonly CheckoutOrderIssue[];
    };

/**
 * Resolves the short-lived browser bridge back into an authoritative order.
 * Catalogue facts are always loaded again; signed claims are only comparison
 * anchors and never become product or price records themselves.
 */
export function resolveCheckoutState(
  token: unknown,
  secret: string,
  options: VerifyCheckoutTokenOptions = {},
): ResolvedCheckoutState {
  if (token === undefined || token === null || token === "") {
    return { ok: false, reason: "MISSING" };
  }

  const verified = verifyCheckoutToken(token, secret, options);

  if (!verified.ok) {
    if (verified.error.code === "TOKEN_EXPIRED") {
      return { ok: false, reason: "EXPIRED" };
    }

    if (verified.error.code === "TOKEN_NOT_YET_VALID") {
      return { ok: false, reason: "NOT_YET_VALID" };
    }

    return { ok: false, reason: "INVALID" };
  }

  const rebuilt = verifyCheckoutOrder({ outfit: verified.claims.reference });

  if (!rebuilt.ok) {
    return {
      ok: false,
      reason: "ORDER_UNAVAILABLE",
      issues: rebuilt.issues,
    };
  }

  const comparison = compareCheckoutClaimsToOrder(
    verified.claims,
    rebuilt.order,
  );

  if (!comparison.ok) {
    return { ok: false, reason: "ORDER_CHANGED" };
  }

  return {
    ok: true,
    claims: verified.claims,
    order: rebuilt.order,
  };
}
