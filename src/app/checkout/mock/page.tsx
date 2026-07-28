import type { Metadata } from "next";
import { cookies } from "next/headers";

import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { MockCheckout } from "@/components/checkout/mock-checkout";
import { readCheckoutCookie } from "@/lib/checkout/cookies";
import { resolveCheckoutState } from "@/lib/checkout/state";
import { verifyPaymentSessionTokenForCheckout } from "@/lib/checkout/workflow";
import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mock hosted checkout",
  description:
    "A clearly labelled local payment simulation for the Fitora checkout flow.",
};

export default async function MockCheckoutPage() {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return (
      <CheckoutShell eyebrow="Mock hosted checkout">
        <CheckoutUnavailable
          message="The payment simulation is not safely configured. Nothing was charged."
          title="Mock checkout is unavailable."
        />
      </CheckoutShell>
    );
  }

  if (environment.paymentProvider !== "mock") {
    return (
      <CheckoutShell eyebrow="Mock hosted checkout">
        <CheckoutUnavailable
          message="Fitora is configured for another payment provider, so this local simulation cannot be used."
          title="Mock mode is not active."
        />
      </CheckoutShell>
    );
  }

  const cookieStore = cookies();
  const [reviewToken, sessionToken] = await Promise.all([
    readCheckoutCookie(cookieStore, "review"),
    readCheckoutCookie(cookieStore, "session"),
  ]);
  const checkout = resolveCheckoutState(
    reviewToken,
    environment.checkoutSigningSecret,
  );
  const session = checkout.ok
    ? verifyPaymentSessionTokenForCheckout(
        sessionToken,
        checkout.claims,
        environment.checkoutSigningSecret,
      )
    : null;

  if (!checkout.ok || !session?.ok || session.claims.provider !== "mock") {
    return (
      <CheckoutShell eyebrow="Mock hosted checkout">
        <CheckoutUnavailable
          message="The short-lived payment session is missing, expired, or does not belong to this order. Nothing was charged."
          title="This mock session cannot be verified."
        />
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell eyebrow="Hosted payment simulation">
      <MockCheckout
        expiresAt={new Date(session.claims.exp * 1_000).toISOString()}
        order={checkout.order}
      />
    </CheckoutShell>
  );
}
