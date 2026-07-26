import type { Metadata } from "next";
import { cookies } from "next/headers";

import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { OrderReview } from "@/components/checkout/order-review";
import { PaymentApprovalForm } from "@/components/checkout/payment-approval-form";
import { readCheckoutCookie } from "@/lib/checkout/cookies";
import { resolveCheckoutState } from "@/lib/checkout/state";
import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review checkout",
  description:
    "Review a server-verified Fitora order before creating a payment session.",
};

function stateMessage(reason: string) {
  if (reason === "EXPIRED") {
    return {
      title: "Your checkout review expired.",
      message:
        "No payment session was created. Build or select the outfit again so Fitora can recheck its current price and availability.",
    };
  }

  if (reason === "ORDER_UNAVAILABLE" || reason === "ORDER_CHANGED") {
    return {
      title: "This order needs a fresh review.",
      message:
        "A catalogue fact changed or an item is no longer available. Nothing was charged; return to the builder and choose a current outfit.",
    };
  }

  return {
    title: "No verified order is ready.",
    message:
      "Choose a complete outfit first. Fitora will verify every product, size, stock record, and price before showing this page.",
  };
}

export default async function CheckoutReviewPage() {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return (
      <CheckoutShell eyebrow="Checkout review">
        <CheckoutUnavailable
          message="Checkout is not safely configured for this environment. Nothing was charged."
          title="Checkout configuration is unavailable."
        />
      </CheckoutShell>
    );
  }

  const reviewToken = await readCheckoutCookie(cookies(), "review");
  const checkout = resolveCheckoutState(
    reviewToken,
    environment.checkoutSigningSecret,
  );

  if (!checkout.ok) {
    const copy = stateMessage(checkout.reason);

    return (
      <CheckoutShell eyebrow="Checkout review">
        <CheckoutUnavailable message={copy.message} title={copy.title} />
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell eyebrow="Verified checkout review">
      {environment.paymentProvider === "mock" ? (
        <aside
          className="mb-6 border-2 border-[#87662c] bg-[#f5e8c8] px-4 py-3 text-sm font-bold text-[#5f471d]"
          role="status"
        >
          Mock payment mode — the next page is a Fitora-hosted simulation,
          not Prava.
        </aside>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:items-start">
        <OrderReview order={checkout.order} />
        <PaymentApprovalForm />
      </div>
    </CheckoutShell>
  );
}
