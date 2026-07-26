import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  CheckoutResult,
  type CheckoutResultViewModel,
} from "@/components/checkout/checkout-result";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { OrderHistoryRecorder } from "@/components/checkout/order-history-recorder";
import { readCheckoutCookie } from "@/lib/checkout/cookies";
import { resolveCheckoutResultState } from "@/lib/checkout/result-state";
import type { SanitizedOrderHistoryEntry } from "@/lib/checkout/history";
import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout result",
  description: "View a sanitized Fitora payment and demo-order result.",
};

export default async function CheckoutResultPage() {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return (
      <CheckoutShell eyebrow="Checkout result">
        <CheckoutResult result={{ status: "reconciliation_required" }} />
      </CheckoutShell>
    );
  }

  const cookieStore = cookies();
  const [resultToken, reviewToken, sessionToken] = await Promise.all([
    readCheckoutCookie(cookieStore, "result"),
    readCheckoutCookie(cookieStore, "review"),
    readCheckoutCookie(cookieStore, "session"),
  ]);
  const state = resolveCheckoutResultState(
    { resultToken, reviewToken, sessionToken },
    environment.checkoutSigningSecret,
  );
  let result: CheckoutResultViewModel;
  let historyEntry: SanitizedOrderHistoryEntry | null = null;

  if (state.status === "approved" || state.status === "declined") {
    const sanitized = state.result;
    result = {
      status:
        sanitized.provider === "mock" && sanitized.status === "approved"
          ? "mock_success"
          : sanitized.status,
      provider: sanitized.provider,
      ...(sanitized.status === "approved"
        ? { orderReference: sanitized.orderReference }
        : {}),
      currency: sanitized.currency,
      totalCents: sanitized.totalCents,
      itemCount: sanitized.itemCount,
      completedAt: sanitized.completedAt,
    };
    historyEntry = {
      version: 1,
      provider: sanitized.provider,
      status: sanitized.status,
      ...(sanitized.status === "approved"
        ? { orderReference: sanitized.orderReference }
        : {}),
      currency: sanitized.currency,
      totalCents: sanitized.totalCents,
      itemCount: sanitized.itemCount,
      completedAt: sanitized.completedAt,
    };
  } else if (
    state.status === "pending" ||
    state.status === "awaiting_payment"
  ) {
    result = {
      status: state.status,
      provider: state.provider,
      currency: state.order.currency,
      totalCents: state.order.totalCents,
      itemCount: state.order.items.length,
    };
  } else {
    result = { status: state.status };
  }

  return (
    <CheckoutShell eyebrow="Sanitized checkout result">
      <CheckoutResult result={result} />
      {historyEntry ? <OrderHistoryRecorder entry={historyEntry} /> : null}
    </CheckoutShell>
  );
}
