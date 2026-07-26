import { verifyPravaProgressTokenForCheckout } from "@/lib/checkout/prava-progress";
import { verifyPravaReconciliationTokenForCheckout } from "@/lib/checkout/prava-reconciliation";
import { verifyCheckoutToken } from "@/lib/checkout/token";
import {
  checkoutResultFromClaims,
  verifyCheckoutResultToken,
  verifyPendingCheckoutResultToken,
  verifyPendingCheckoutResultTokenForCheckout,
  verifyPaymentSessionTokenForCheckout,
  type SanitizedCheckoutResult,
  type VerifyWorkflowTokenOptions,
} from "@/lib/checkout/workflow";
import type { VerifiedOrder } from "@/lib/checkout/order";
import type { PaymentProviderName } from "@/lib/payments/types";

export type CheckoutResultState =
  | {
      status: "approved" | "declined";
      result: SanitizedCheckoutResult;
    }
  | {
      status: "pending" | "awaiting_payment";
      provider: PaymentProviderName;
      order: VerifiedOrder;
    }
  | { status: "expired" }
  | {
      status: "reconciliation_required";
      provider?: PaymentProviderName;
      order?: VerifiedOrder;
    };

type CheckoutResultStateInput = {
  resultToken?: string;
  reviewToken?: string;
  sessionToken?: string;
};

/**
 * Resolves only signed server state into the public result-page state machine.
 * A malformed signed-cookie combination is surfaced as reconciliation rather
 * than being mistaken for either success or a normal expiry.
 */
export function resolveCheckoutResultState(
  input: CheckoutResultStateInput,
  secret: string,
  options: VerifyWorkflowTokenOptions = {},
): CheckoutResultState {
  const hasReviewState = Boolean(input.reviewToken);
  const hasSessionState = Boolean(input.sessionToken);

  // Terminal result-only refreshes are idempotent, but a result cookie can
  // never override a newer checkout while either transient cookie is present.
  if (!hasReviewState && !hasSessionState) {
    if (!input.resultToken) {
      return { status: "expired" };
    }

    const verifiedResult = verifyCheckoutResultToken(
      input.resultToken,
      secret,
      options,
    );

    if (verifiedResult.ok) {
      const result = checkoutResultFromClaims(verifiedResult.claims);

      return result
        ? { status: result.status, result }
        : { status: "reconciliation_required" };
    }

    const pendingMarker = verifyPendingCheckoutResultToken(
      input.resultToken,
      secret,
      options,
    );

    return verifiedResult.error.code === "TOKEN_EXPIRED" ||
      (!pendingMarker.ok &&
        pendingMarker.error.code === "TOKEN_EXPIRED")
      ? { status: "expired" }
      : { status: "reconciliation_required" };
  }

  const checkout = verifyCheckoutToken(
    input.reviewToken,
    secret,
    options,
  );

  if (!checkout.ok) {
    if (!input.reviewToken && hasSessionState) {
      return { status: "reconciliation_required" };
    }

    return !input.reviewToken || checkout.error.code === "TOKEN_EXPIRED"
      ? { status: "expired" }
      : { status: "reconciliation_required" };
  }

  if (!input.sessionToken) {
    return { status: "expired" };
  }

  const session = verifyPaymentSessionTokenForCheckout(
    input.sessionToken,
    checkout.claims,
    secret,
    options,
  );

  if (!session.ok) {
    return session.error.code === "TOKEN_EXPIRED"
      ? { status: "expired" }
      : { status: "reconciliation_required" };
  }

  const order = session.claims.order;

  if (input.resultToken) {
    const pendingMarker =
      verifyPendingCheckoutResultTokenForCheckout(
        input.resultToken,
        checkout.claims,
        session.claims,
        order,
        secret,
        options,
      );

    if (pendingMarker.ok) {
      return {
        status: "pending",
        provider: session.claims.provider,
        order,
      };
    }

    const progress = verifyPravaProgressTokenForCheckout(
      input.resultToken,
      checkout.claims,
      session.claims,
      order,
      secret,
      options,
    );

    if (progress.ok) {
      return {
        status: "reconciliation_required",
        provider: "prava",
        order,
      };
    }

    const reconciliation =
      verifyPravaReconciliationTokenForCheckout(
        input.resultToken,
        checkout.claims,
        session.claims,
        order,
        secret,
        options,
      );

    if (reconciliation.ok) {
      return {
        status: "reconciliation_required",
        provider: "prava",
        order,
      };
    }
  }

  return {
    status: "awaiting_payment",
    provider: session.claims.provider,
    order,
  };
}
