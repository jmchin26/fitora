import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  CheckoutResult,
  type CheckoutResultViewModel,
} from "@/components/checkout/checkout-result";
import { CheckoutShell } from "@/components/checkout/checkout-shell";
import { OrderHistoryRecorder } from "@/components/checkout/order-history-recorder";
import { PravaAttemptLeaseRelease } from "@/components/checkout/prava-attempt-lease-release";
import {
  isCheckoutAttemptId,
  readCheckoutAttemptCookie,
  readCheckoutCookie,
} from "@/lib/checkout/cookies";
import { resolveCheckoutResultState } from "@/lib/checkout/result-state";
import type { SanitizedOrderHistoryEntry } from "@/lib/checkout/history";
import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout result",
  description: "View a sanitized Fitora payment and demo-order result.",
};

type CheckoutResultPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function CheckoutResultPage({
  searchParams,
}: CheckoutResultPageProps) {
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

  const rawAttemptId = (await searchParams).attempt;
  const attemptId = isCheckoutAttemptId(rawAttemptId)
    ? rawAttemptId
    : undefined;
  const cookieStore = cookies();
  const [resultToken, reviewToken, sessionToken] = await Promise.all([
    attemptId
      ? readCheckoutAttemptCookie(cookieStore, "result", attemptId)
      : readCheckoutCookie(cookieStore, "result"),
    attemptId
      ? readCheckoutAttemptCookie(cookieStore, "review", attemptId)
      : readCheckoutCookie(cookieStore, "review"),
    attemptId
      ? readCheckoutAttemptCookie(cookieStore, "session", attemptId)
      : readCheckoutCookie(cookieStore, "session"),
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
      ...(attemptId
        ? { retryUrl: `/checkout/callback/${attemptId}` }
        : {}),
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
      ...(attemptId
        ? { retryUrl: `/checkout/callback/${attemptId}` }
        : {}),
    };
  } else if (
    state.status === "reconciliation_required" &&
    state.provider &&
    state.order
  ) {
    result = {
      status: state.status,
      provider: state.provider,
      currency: state.order.currency,
      totalCents: state.order.totalCents,
      itemCount: state.order.items.length,
      ...(attemptId
        ? { retryUrl: `/checkout/callback/${attemptId}` }
        : {}),
    };
  } else {
    result = { status: state.status };
  }

  return (
    <CheckoutShell eyebrow="Sanitized checkout result">
      <CheckoutResult result={result} />
      {historyEntry ? <OrderHistoryRecorder entry={historyEntry} /> : null}
      {attemptId &&
      (state.status === "approved" ||
        state.status === "declined" ||
        state.status === "expired") ? (
        <PravaAttemptLeaseRelease attemptId={attemptId} />
      ) : null}
    </CheckoutShell>
  );
}
