import Link from "next/link";

import { formatUsd } from "@/lib/money";

export const CHECKOUT_RESULT_STATUSES = [
  "approved",
  "declined",
  "awaiting_payment",
  "pending",
  "expired",
  "reconciliation_required",
  "mock_success",
] as const;

export type CheckoutResultStatus =
  (typeof CHECKOUT_RESULT_STATUSES)[number];

export type CheckoutResultViewModel = {
  status: CheckoutResultStatus;
  provider?: "mock" | "prava";
  orderReference?: string;
  totalCents?: number;
  currency?: "USD";
  completedAt?: string;
  itemCount?: number;
  retryUrl?: string;
};

type CheckoutResultProps = {
  result: CheckoutResultViewModel;
};

type ResultContent = {
  eyebrow: string;
  title: string;
  message: string;
  note?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  toneClassName: string;
};

const RESULT_CONTENT: Record<CheckoutResultStatus, ResultContent> = {
  approved: {
    eyebrow: "Payment approved",
    title: "Your outfit order is confirmed.",
    message:
      "The payment and Fitora merchant order both completed successfully.",
    primary: { href: "/build", label: "Build another outfit" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[var(--sage-dark)] bg-[#e5e8df] text-[#31402e]",
  },
  mock_success: {
    eyebrow: "Mock payment completed",
    title: "The checkout simulation worked.",
    message:
      "Fitora completed the mock provider and merchant path. No real payment was made.",
    primary: { href: "/build", label: "Start another checkout" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[#87662c] bg-[#f5e8c8] text-[#5f471d]",
  },
  declined: {
    eyebrow: "Payment declined",
    title: "The order was not placed.",
    message:
      "No approved payment was recorded and the Fitora merchant did not complete the order.",
    primary: { href: "/build", label: "Start a fresh checkout" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[#8a352d] bg-[#f5e9e4] text-[#783129]",
  },
  awaiting_payment: {
    eyebrow: "Payment not submitted",
    title: "The hosted payment is waiting for you.",
    message:
      "Fitora has a valid checkout session, but no payment attempt or provider result has been confirmed.",
    note: "This is not a pending charge. Complete the hosted step or start a fresh checkout.",
    primary: { href: "/build", label: "Start a fresh checkout" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[var(--line)] bg-[#eeeadf] text-[var(--ink)]",
  },
  pending: {
    eyebrow: "Payment pending",
    title: "The provider is still processing.",
    message:
      "Fitora has not recorded a final payment result yet. Check again before attempting another payment.",
    note: "Do not submit a second payment while this status is pending.",
    primary: { href: "/checkout/result", label: "Check status again" },
    secondary: { href: "/build", label: "Return to outfits" },
    toneClassName: "border-[#87662c] bg-[#f5e8c8] text-[#5f471d]",
  },
  expired: {
    eyebrow: "Checkout expired",
    title: "This payment session has ended.",
    message:
      "No final payment was confirmed. Start again so Fitora can recheck the catalogue and create a fresh session.",
    primary: { href: "/build", label: "Start over" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[var(--line)] bg-[#eeeadf] text-[var(--ink)]",
  },
  reconciliation_required: {
    eyebrow: "Payment needs review",
    title: "Fitora cannot safely confirm the outcome yet.",
    message:
      "The provider and merchant records need reconciliation before this order can be treated as complete.",
    note: "Do not submit another payment for this order while its status is being checked.",
    primary: { href: "/checkout/result", label: "Check status again" },
    secondary: { href: "/", label: "Return home" },
    toneClassName: "border-[#8a352d] bg-[#f5e9e4] text-[#783129]",
  },
};

function formatCompletedAt(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function CheckoutResult({ result }: CheckoutResultProps) {
  const content = RESULT_CONTENT[result.status];
  const isPravaStatusCheck =
    result.provider === "prava" &&
    (result.status === "pending" ||
      result.status === "reconciliation_required");
  const primaryAction =
    result.status === "awaiting_payment" && result.provider === "mock"
      ? { href: "/checkout/mock", label: "Return to mock payment" }
      : isPravaStatusCheck
        ? {
            href: result.retryUrl ?? "/checkout/callback",
            label: "Check with Prava again",
          }
      : content.primary;
  const completedAt = result.completedAt
    ? formatCompletedAt(result.completedAt)
    : null;

  return (
    <section
      aria-labelledby="checkout-result-title"
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12"
    >
      {result.provider === "mock" || result.status === "mock_success" ? (
        <aside
          className="mb-5 border-2 border-[#87662c] bg-[#f5e8c8] px-4 py-3 text-sm font-bold text-[#5f471d]"
          role="status"
        >
          Mock payment result — this was a simulation and no real charge was
          created.
        </aside>
      ) : null}

      <article className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">
        <div className={`border-l-4 px-4 py-4 ${content.toneClassName}`}>
          <p className="text-xs font-bold uppercase tracking-[0.16em]">
            {content.eyebrow}
          </p>
          <h1
            className="mt-2 font-serif text-3xl leading-tight tracking-[-0.04em] sm:text-4xl"
            id="checkout-result-title"
          >
            {content.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
            {content.message}
          </p>
        </div>

        <section aria-labelledby="sanitized-summary-title" className="mt-7">
          <h2
            className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-ink)]"
            id="sanitized-summary-title"
          >
            Sanitized payment summary
          </h2>
          <dl className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <dt className="text-[var(--muted-ink)]">Status</dt>
              <dd className="font-semibold">{content.eyebrow}</dd>
            </div>
            {result.provider ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <dt className="text-[var(--muted-ink)]">Provider</dt>
                <dd className="font-semibold">
                  {result.provider === "mock" ? "Mock" : "Prava sandbox"}
                </dd>
              </div>
            ) : null}
            {result.orderReference ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <dt className="text-[var(--muted-ink)]">Order reference</dt>
                <dd className="break-all font-semibold tabular-nums">
                  {result.orderReference}
                </dd>
              </div>
            ) : null}
            {typeof result.itemCount === "number" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <dt className="text-[var(--muted-ink)]">Items</dt>
                <dd className="font-semibold tabular-nums">
                  {result.itemCount}
                </dd>
              </div>
            ) : null}
            {typeof result.totalCents === "number" && result.currency === "USD" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <dt className="text-[var(--muted-ink)]">Total</dt>
                <dd className="font-semibold tabular-nums">
                  {formatUsd(result.totalCents)}
                </dd>
              </div>
            ) : null}
            {completedAt ? (
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <dt className="text-[var(--muted-ink)]">Recorded</dt>
                <dd className="font-semibold tabular-nums">{completedAt}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted-ink)]">
            Payment credentials, card data, email, and provider session tokens
            are never displayed here.
          </p>
        </section>

        {content.note ? (
          <p className="mt-6 border-l-2 border-[var(--ink)] bg-[#eeeadf] px-4 py-3 text-sm font-semibold">
            {content.note}
          </p>
        ) : null}

        <nav aria-label="Checkout result actions" className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            className="flex min-h-12 items-center justify-center bg-[var(--ink)] px-5 py-3 text-center font-bold text-white no-underline transition-colors hover:bg-[var(--sage-dark)]"
            href={primaryAction.href}
            prefetch={isPravaStatusCheck ? false : undefined}
          >
            {primaryAction.label}
          </Link>
          {content.secondary ? (
            <Link
              className="flex min-h-12 items-center justify-center border border-[var(--line)] px-5 py-3 text-center font-bold no-underline transition-colors hover:border-[var(--sage)] hover:bg-[#eeeadf]"
              href={content.secondary.href}
            >
              {content.secondary.label}
            </Link>
          ) : null}
        </nav>
      </article>
    </section>
  );
}
