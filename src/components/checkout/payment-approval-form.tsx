"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  CheckoutApiErrorSchema,
  CheckoutApprovalRequestSchema,
  CheckoutSessionStartedSchema,
} from "@/lib/checkout/api-contracts";
import {
  releasePravaBrowserAttempt,
  reservePravaBrowserAttempt,
} from "@/lib/checkout/prava-browser-lease";

type PaymentApprovalFormProps = {
  attemptId: string;
  provider?: "mock" | "prava";
  reviewId: string;
  onNavigate?: (url: string) => void;
};

// The Prava client has a 10-second server-side timeout. Keep the browser
// boundary longer so an authoritative server failure arrives before the UI
// labels the side-effecting request as ambiguous.
const REQUEST_TIMEOUT_MS = 15_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function PaymentApprovalForm({
  attemptId,
  provider = "mock",
  reviewId,
  onNavigate,
}: PaymentApprovalFormProps) {
  const [email, setEmail] = useState("");
  const [isApproved, setIsApproved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAmbiguous, setIsAmbiguous] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const formElement = useRef<HTMLFormElement | null>(null);
  const emailElement = useRef<HTMLInputElement | null>(null);
  const approvalElement = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  async function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isAmbiguous) {
      return;
    }

    const parsed = CheckoutApprovalRequestSchema.safeParse({
      attemptId,
      email,
      reviewId,
    });
    const nextEmailError = parsed.success
      ? null
      : "Enter a valid email address for the payment receipt.";
    const nextApprovalError = isApproved
      ? null
      : "Confirm that you reviewed the order before continuing.";

    setEmailError(nextEmailError);
    setApprovalError(nextApprovalError);
    setRequestError(null);

    if (!parsed.success) {
      emailElement.current?.focus();
      return;
    }

    if (!isApproved) {
      approvalElement.current?.focus();
      return;
    }

    setIsSubmitting(true);

    if (provider === "prava") {
      const reserved = await reservePravaBrowserAttempt(attemptId);

      if (!mounted.current) {
        if (reserved) {
          releasePravaBrowserAttempt(attemptId);
        }
        return;
      }

      if (!reserved) {
        setRequestError(
          "Another Prava checkout is already active in this browser. Finish it or wait for it to expire before starting another payment.",
        );
        setIsSubmitting(false);
        return;
      }
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    let didTimeOut = false;
    const timeout = window.setTimeout(() => {
      didTimeOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    activeRequest.current = controller;

    try {
      const response = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      const body = await readJson(response);

      if (
        controller.signal.aborted ||
        activeRequest.current !== controller ||
        !mounted.current ||
        !formElement.current?.isConnected
      ) {
        return;
      }

      if (!response.ok) {
        const parsedError = CheckoutApiErrorSchema.safeParse(body);

        if (
          provider === "prava" &&
          (!parsedError.success ||
            parsedError.data.error.code ===
              "PAYMENT_SESSION_UNCERTAIN" ||
            parsedError.data.error.code === "PAYMENT_SESSION_ACTIVE")
        ) {
          setIsAmbiguous(true);
        } else if (provider === "prava") {
          releasePravaBrowserAttempt(attemptId);
        }

        setRequestError(
          parsedError.success
            ? parsedError.data.error.message
            : "Fitora could not create the payment session. Review the order and try again.",
        );
        return;
      }

      const parsedSession = CheckoutSessionStartedSchema.safeParse(body);

      if (
        !parsedSession.success ||
        parsedSession.data.provider !== provider
      ) {
        setIsAmbiguous(true);
        setRequestError(
          "Fitora returned an unexpected payment response, so the session status is uncertain. Do not reload, retry, or start another checkout until this attempt expires.",
        );
        return;
      }

      const navigate =
        onNavigate ?? ((url: string) => window.location.assign(url));
      navigate(parsedSession.data.hostedUrl);
    } catch (error) {
      if (!mounted.current) {
        return;
      }

      if (
        didTimeOut ||
        (controller.signal.aborted && activeRequest.current === controller)
      ) {
        setIsAmbiguous(true);
        setRequestError(
          "The payment session response timed out, so its status is uncertain. Do not reload, retry, or start another checkout until this attempt expires.",
        );
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setIsAmbiguous(true);
      setRequestError(
        "Fitora could not confirm the payment-session response. Do not reload, retry, or start another checkout until this attempt expires.",
      );
    } finally {
      window.clearTimeout(timeout);

      if (activeRequest.current === controller) {
        activeRequest.current = null;

        if (mounted.current) {
          setIsSubmitting(false);
        }
      }
    }
  }

  return (
    <section
      aria-labelledby="payment-approval-title"
      className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
        Your approval
      </p>
      <h2
        className="mt-2 font-serif text-2xl tracking-[-0.03em] sm:text-3xl"
        id="payment-approval-title"
      >
        Confirm and continue
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-ink)]">
        A short-lived payment session is created only after you click the
        button below. Fitora uses your email for this checkout request only.
      </p>

      <form
        aria-busy={isSubmitting}
        className="mt-6 space-y-5"
        noValidate
        onSubmit={(event) => void submitApproval(event)}
        ref={formElement}
      >
        <div>
          <label className="text-sm font-bold" htmlFor="checkout-email">
            Email address
          </label>
          <input
            aria-describedby={
              emailError ? "checkout-email-help checkout-email-error" : "checkout-email-help"
            }
            aria-invalid={Boolean(emailError)}
            autoComplete="email"
            className="mt-2 min-h-12 w-full border border-[var(--line)] bg-white px-4 py-3 text-base transition-colors placeholder:text-[#7a8075] hover:border-[var(--sage)] disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting || isAmbiguous}
            id="checkout-email"
            inputMode="email"
            maxLength={254}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            placeholder="you@example.com"
            ref={emailElement}
            spellCheck={false}
            type="email"
            value={email}
          />
          <p
            className="mt-2 text-xs leading-relaxed text-[var(--muted-ink)]"
            id="checkout-email-help"
          >
            Used for the receipt. It is not shown on the result page.
          </p>
          {emailError ? (
            <p
              className="mt-2 text-sm font-semibold text-[#8a352d]"
              id="checkout-email-error"
              role="alert"
            >
              {emailError}
            </p>
          ) : null}
        </div>

        <div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 border border-[var(--line)] bg-[#eeeadf] px-4 py-3.5 text-sm leading-relaxed has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]">
            <input
              aria-describedby={approvalError ? "checkout-approval-error" : undefined}
              aria-invalid={Boolean(approvalError)}
              checked={isApproved}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--sage-dark)]"
              disabled={isSubmitting || isAmbiguous}
              onChange={(event) => {
                setIsApproved(event.target.checked);
                setApprovalError(null);
              }}
              ref={approvalElement}
              type="checkbox"
            />
            <span>
              I reviewed the three products, selected sizes, merchant, and
              total, and I want Fitora to create a payment session.
            </span>
          </label>
          {approvalError ? (
            <p
              className="mt-2 text-sm font-semibold text-[#8a352d]"
              id="checkout-approval-error"
              role="alert"
            >
              {approvalError}
            </p>
          ) : null}
        </div>

        {requestError ? (
          <p
            className="border-l-2 border-[#8a352d] bg-[#f5e9e4] px-4 py-3 text-sm font-semibold text-[#783129]"
            role="alert"
          >
            {requestError}
          </p>
        ) : null}

        <button
          className="min-h-12 w-full bg-[var(--ink)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          disabled={isSubmitting || isAmbiguous}
          type="submit"
        >
          {isAmbiguous
            ? "Session status uncertain"
            : isSubmitting
              ? "Creating secure session…"
              : "Continue to payment"}
        </button>
      </form>
    </section>
  );
}
