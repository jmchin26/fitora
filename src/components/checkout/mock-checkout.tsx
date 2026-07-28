"use client";

import { useEffect, useRef, useState } from "react";

import {
  CheckoutApiErrorSchema,
  CheckoutFinalizedSchema,
  type MockFinalizeRequest,
} from "@/lib/checkout/api-contracts";
import type { VerifiedOrder } from "@/lib/checkout/order";
import { formatUsd } from "@/lib/money";

type MockCheckoutProps = {
  order: VerifiedOrder;
  expiresAt?: string;
  onNavigate?: (url: string) => void;
};

const REQUEST_TIMEOUT_MS = 8_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatExpiry(value: string): string | null {
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

export function MockCheckout({
  order,
  expiresAt,
  onNavigate,
}: MockCheckoutProps) {
  const [activeDecision, setActiveDecision] = useState<
    MockFinalizeRequest["decision"] | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const rootElement = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);
  const formattedExpiry = expiresAt ? formatExpiry(expiresAt) : null;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  async function finalize(decision: MockFinalizeRequest["decision"]) {
    if (activeDecision) {
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    let didTimeOut = false;
    const timeout = window.setTimeout(() => {
      didTimeOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    activeRequest.current = controller;
    setActiveDecision(decision);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/checkout/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision } satisfies MockFinalizeRequest),
        signal: controller.signal,
      });
      const body = await readJson(response);

      if (
        controller.signal.aborted ||
        activeRequest.current !== controller ||
        !mounted.current ||
        !rootElement.current?.isConnected
      ) {
        return;
      }

      if (!response.ok) {
        const parsedError = CheckoutApiErrorSchema.safeParse(body);
        setErrorMessage(
          parsedError.success
            ? parsedError.data.error.message
            : "The mock payment could not be finalized. Try the simulation again.",
        );
        return;
      }

      const parsedResult = CheckoutFinalizedSchema.safeParse(body);

      if (!parsedResult.success) {
        setErrorMessage(
          "Fitora returned an unexpected mock result. No completion was recorded in this browser.",
        );
        return;
      }

      const navigate =
        onNavigate ?? ((url: string) => window.location.assign(url));
      navigate(parsedResult.data.redirectUrl);
    } catch (error) {
      if (!mounted.current) {
        return;
      }

      if (
        didTimeOut ||
        (controller.signal.aborted && activeRequest.current === controller)
      ) {
        setErrorMessage(
          "The mock payment request timed out. Its outcome was not confirmed; try again.",
        );
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setErrorMessage(
        "Fitora could not reach the mock payment service. No outcome was confirmed.",
      );
    } finally {
      window.clearTimeout(timeout);

      if (activeRequest.current === controller) {
        activeRequest.current = null;

        if (mounted.current) {
          setActiveDecision(null);
        }
      }
    }
  }

  return (
    <section
      aria-labelledby="mock-checkout-title"
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12"
      ref={rootElement}
    >
      <aside
        className="border-2 border-[#87662c] bg-[#f5e8c8] px-4 py-3 text-sm font-bold text-[#5f471d]"
        role="status"
      >
        Mock payment mode — Prava credentials are not configured.
      </aside>

      <section className="mt-5 border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
          Checkout · Step 2 of 2
        </p>
        <h1
          className="mt-2 font-serif text-3xl tracking-[-0.04em] sm:text-4xl"
          id="mock-checkout-title"
        >
          Simulate the hosted payment
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-ink)] sm:text-base">
          Choose an outcome to test Fitora’s full checkout flow. This page does
          not collect card details and cannot create a real charge.
        </p>

        <dl className="mt-7 border-y border-[var(--line)] py-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[var(--muted-ink)]">Merchant</dt>
            <dd className="font-semibold">Fitora Merchant</dd>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <dt className="text-[var(--muted-ink)]">Items</dt>
            <dd className="font-semibold tabular-nums">{order.items.length}</dd>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <dt className="text-[var(--muted-ink)]">Verified total</dt>
            <dd className="font-serif text-3xl tracking-[-0.04em] tabular-nums">
              {formatUsd(order.totalCents)}
            </dd>
          </div>
          {formattedExpiry ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
              <dt className="text-[var(--muted-ink)]">Session expires</dt>
              <dd className="font-semibold tabular-nums">{formattedExpiry}</dd>
            </div>
          ) : null}
        </dl>

        <fieldset className="mt-7" disabled={Boolean(activeDecision)}>
          <legend className="text-sm font-bold">Choose a mock outcome</legend>
          <p className="mt-1 text-sm text-[var(--muted-ink)]">
            Both actions are simulations. Approve is the primary test path.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              className="min-h-12 bg-[var(--ink)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-60"
              onClick={() => void finalize("approve")}
              type="button"
            >
              {activeDecision === "approve"
                ? "Approving simulation…"
                : "Approve mock payment"}
            </button>
            <button
              className="min-h-12 border border-[#8a352d] bg-transparent px-5 py-3 font-bold text-[#783129] transition-colors hover:bg-[#f5e9e4] disabled:cursor-wait disabled:opacity-60"
              onClick={() => void finalize("decline")}
              type="button"
            >
              {activeDecision === "decline"
                ? "Declining simulation…"
                : "Decline mock payment"}
            </button>
          </div>
        </fieldset>

        {errorMessage ? (
          <p
            className="mt-5 border-l-2 border-[#8a352d] bg-[#f5e9e4] px-4 py-3 text-sm font-semibold text-[#783129]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <p className="mt-6 text-xs leading-relaxed text-[var(--muted-ink)]">
          No card number, expiry, CVV, OTP, or payment credential is requested
          or displayed in mock mode.
        </p>
      </section>
    </section>
  );
}
