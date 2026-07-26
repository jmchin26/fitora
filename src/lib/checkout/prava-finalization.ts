import { resolvePravaAwaitingContext } from "@/lib/checkout/prava-context";
import type { PravaProgressTokenClaims } from "@/lib/checkout/prava-progress";
import {
  matchesPravaProgressTransactionReference,
  type PravaProgressExpectedOutcome,
} from "@/lib/checkout/prava-progress";
import type { VerifiedOrder } from "@/lib/checkout/order";
import {
  createPravaDemoMerchant,
  pravaDemoAuthorizationCodeForTransaction,
  pravaDemoOrderReferenceForSession,
  type PravaDemoMerchantAdapter,
  type PravaDemoMerchantResult,
} from "@/lib/merchant/prava-demo-merchant";
import {
  isPravaClientError,
  type PravaClient,
  type PravaMerchant,
  type PravaPaymentResult,
  type PravaReportStatusInput,
} from "@/lib/payments/prava";
import type { PaymentResult } from "@/lib/payments/types";

const INITIAL_POLL_ATTEMPTS = 4;
const CONFIRMATION_POLL_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 250;
const activeFinalizations = new Map<
  string,
  Promise<PravaFinalizationOutcome>
>();

export type PravaProgressIssueState = Readonly<{
  transactionReference: string;
  expectedOutcome: PravaProgressExpectedOutcome;
}>;

export type PravaFinalizationOutcome =
  | Readonly<{
      status: "terminal";
      paymentResult: Exclude<PaymentResult, { status: "pending" }>;
    }>
  | Readonly<{
      status: "pending";
      providerConfirmed: boolean;
      progress?: PravaProgressIssueState;
    }>
  | Readonly<{
      status: "reconciliation_required";
      progress?: PravaProgressIssueState;
    }>;

export type FinalizePravaCheckoutInput = Readonly<{
  client: Pick<
    PravaClient,
    "getPaymentResult" | "pollPaymentResult" | "reportStatus"
  >;
  merchant?: PravaDemoMerchantAdapter;
  merchantProfile: PravaMerchant;
  order: VerifiedOrder;
  sessionId: string;
  signingSecret: string;
  existingProgress?: PravaProgressTokenClaims;
  /**
   * Set to false when the caller cannot prove that the reviewed catalogue
   * snapshot is current. It defaults to true; existing progress still resumes
   * its recorded outcome.
   */
  merchantExecutionAllowed?: boolean;
  signal?: AbortSignal;
}>;

type PollResolution =
  | Readonly<{ ok: true; result: PravaPaymentResult }>
  | Readonly<{ ok: false; state: "confirmed_pending" }>
  | Readonly<{
      ok: false;
      state: "provider_uncertain";
      retryable: boolean;
    }>;

function expectedOutcomeFromMerchant(
  result: PravaDemoMerchantResult,
): PravaProgressExpectedOutcome {
  return result.status === "approved"
    ? {
        status: "approved",
        orderReference: result.orderReference,
      }
    : {
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      };
}

function paymentResultFromExpectedOutcome(
  expectedOutcome: PravaProgressExpectedOutcome,
  sessionId: string,
): Exclude<PaymentResult, { status: "pending" }> {
  return expectedOutcome.status === "approved"
    ? {
        provider: "prava",
        sessionId,
        status: "approved",
        orderReference: expectedOutcome.orderReference,
      }
    : {
        provider: "prava",
        sessionId,
        status: "declined",
        reasonCode: expectedOutcome.reasonCode,
      };
}

function terminalFromProviderState(
  state: Extract<PravaPaymentResult, { status: "completed" | "failed" }>,
  input: FinalizePravaCheckoutInput,
  expectedOutcome = input.existingProgress?.expectedOutcome,
): PravaFinalizationOutcome {
  if (expectedOutcome) {
    const providerMatchesExpected =
      (state.status === "completed" &&
        expectedOutcome.status === "approved") ||
      (state.status === "failed" &&
        expectedOutcome.status === "declined");

    return providerMatchesExpected
      ? {
          status: "terminal",
          paymentResult: paymentResultFromExpectedOutcome(
            expectedOutcome,
            input.sessionId,
          ),
        }
      : { status: "reconciliation_required" };
  }

  return state.status === "completed"
    ? {
        status: "terminal",
        paymentResult: {
          provider: "prava",
          sessionId: input.sessionId,
          status: "approved",
          orderReference: pravaDemoOrderReferenceForSession(
            input.sessionId,
            input.order,
          ),
        },
      }
    : {
        status: "terminal",
        paymentResult: {
          provider: "prava",
          sessionId: input.sessionId,
          status: "declined",
          reasonCode: "PROVIDER_DECLINED",
        },
      };
}

function preserveProgressForReconciliation(
  outcome: PravaFinalizationOutcome,
  progress: PravaProgressIssueState,
): PravaFinalizationOutcome {
  return outcome.status === "reconciliation_required"
    ? { ...outcome, progress }
    : outcome;
}

function reportInputForExpectedOutcome(
  transactionReference: string,
  expectedOutcome: PravaProgressExpectedOutcome,
  order: VerifiedOrder,
): PravaReportStatusInput {
  if (expectedOutcome.status === "approved") {
    return {
      transactionReferenceId: transactionReference,
      status: "APPROVED",
      transactionType: "PURCHASE",
      authorizationCode:
        pravaDemoAuthorizationCodeForTransaction(
          transactionReference,
          order,
        ),
      responseCode: "00",
      amountPaidCents: order.totalCents,
    };
  }

  return {
    transactionReferenceId: transactionReference,
    status: "DECLINED",
    transactionType: "PURCHASE",
    authorizationCode: "000000",
    responseCode: "05",
  };
}

function reportInputFromMerchant(
  transactionReference: string,
  result: PravaDemoMerchantResult,
  order: VerifiedOrder,
): PravaReportStatusInput {
  return {
    transactionReferenceId: transactionReference,
    status: result.reportStatus,
    transactionType: "PURCHASE",
    authorizationCode: result.authorizationCode,
    responseCode: result.responseCode,
    ...(result.status === "approved"
      ? { amountPaidCents: order.totalCents }
      : {}),
  };
}

async function boundedPoll(
  client: FinalizePravaCheckoutInput["client"],
  sessionId: string,
  maxAttempts: number,
  signal?: AbortSignal,
): Promise<PollResolution> {
  try {
    const result = await client.pollPaymentResult(sessionId, {
      signal,
      intervalMs: POLL_INTERVAL_MS,
      maxAttempts,
    });

    return { ok: true, result };
  } catch (error) {
    if (
      isPravaClientError(error) &&
      error.code === "POLL_EXHAUSTED"
    ) {
      return { ok: false, state: "confirmed_pending" };
    }

    return {
      ok: false,
      state: "provider_uncertain",
      retryable: isPravaClientError(error) && error.retryable,
    };
  }
}

function confirmedReportMatches(
  report: Awaited<ReturnType<PravaClient["reportStatus"]>>,
  expectedStatus: "APPROVED" | "DECLINED",
  expectedTransactionReference: string,
): boolean {
  return (
    report.status === "confirmed" &&
    report.transactionReferenceId === expectedTransactionReference &&
    report.transactionStatus === expectedStatus &&
    report.visaConfirmation === "SUCCESS"
  );
}

async function recoverAfterReportError(
  input: FinalizePravaCheckoutInput,
  progress: PravaProgressIssueState,
): Promise<PravaFinalizationOutcome> {
  let state: PravaPaymentResult;

  try {
    state = await input.client.getPaymentResult(
      input.sessionId,
      undefined,
    );
  } catch {
    return { status: "reconciliation_required", progress };
  }

  if (state.status === "completed" || state.status === "failed") {
    return preserveProgressForReconciliation(
      terminalFromProviderState(
        state,
        input,
        progress.expectedOutcome,
      ),
      progress,
    );
  }

  return { status: "reconciliation_required", progress };
}

/**
 * Executes the server-only Prava callback state machine. Credential material
 * is destructured only for the immediate merchant call and is absent from all
 * returned outcomes, progress markers, errors, and public state.
 */
export async function finalizePravaCheckout(
  input: FinalizePravaCheckoutInput,
): Promise<PravaFinalizationOutcome> {
  const initial = await boundedPoll(
    input.client,
    input.sessionId,
    INITIAL_POLL_ATTEMPTS,
    input.signal,
  );

  if (!initial.ok) {
    if (initial.state === "confirmed_pending") {
      return { status: "pending", providerConfirmed: true };
    }

    return initial.retryable
      ? { status: "pending", providerConfirmed: false }
      : { status: "reconciliation_required" };
  }

  if (
    initial.result.status === "completed" ||
    initial.result.status === "failed"
  ) {
    return terminalFromProviderState(initial.result, input);
  }

  if (initial.result.status === "pending") {
    return { status: "pending", providerConfirmed: true };
  }

  const context = resolvePravaAwaitingContext(
    initial.result,
    input.order,
    input.merchantProfile,
  );

  if (
    !context.ok &&
    context.reason === "INVALID_PROVIDER_CONTEXT"
  ) {
    return { status: "reconciliation_required" };
  }

  const transactionReference = context.ok
    ? context.lineItem.transactionReferenceId
    : context.transactionReference;
  let expectedOutcome: PravaProgressExpectedOutcome;
  let reportInput: PravaReportStatusInput;

  if (input.existingProgress) {
    if (
      !matchesPravaProgressTransactionReference(
        input.existingProgress,
        transactionReference,
        input.signingSecret,
      )
    ) {
      return { status: "reconciliation_required" };
    }

    expectedOutcome = input.existingProgress.expectedOutcome;
    reportInput = reportInputForExpectedOutcome(
      transactionReference,
      expectedOutcome,
      input.order,
    );
  } else if (
    !context.ok ||
    input.merchantExecutionAllowed === false
  ) {
    // The provider has supplied one unambiguous transaction reference, but
    // Fitora cannot safely execute the merchant. Decline without touching the
    // credential and persist enough safe progress to retry the report.
    expectedOutcome = {
      status: "declined",
      reasonCode: "MERCHANT_DECLINED",
    };
    reportInput = reportInputForExpectedOutcome(
      transactionReference,
      expectedOutcome,
      input.order,
    );
  } else {
    const merchant = input.merchant ?? createPravaDemoMerchant();
    let merchantResult: PravaDemoMerchantResult;

    try {
      merchantResult = await merchant.checkout(
        {
          order: input.order,
          sessionId: input.sessionId,
          txnRefId: transactionReference,
          credentials: {
            token: context.lineItem.credential.token,
            dynamicCvv: context.lineItem.credential.dynamicCvv,
            expiryMonth: Number(
              context.lineItem.credential.expiryMonth,
            ),
            expiryYear: Number(
              context.lineItem.credential.expiryYear,
            ),
          },
          context: {
            merchantId: input.order.merchantId,
            currency: input.order.currency,
            totalCents: input.order.totalCents,
          },
        },
        input.signal ?? new AbortController().signal,
      );
    } catch {
      // Once the credential-bearing merchant call starts, conservatively
      // treat any failure as a decline and always attempt to report it.
      merchantResult = {
        status: "declined",
        reasonCode: "INVALID_INPUT",
        reportStatus: "DECLINED",
        authorizationCode: "000000",
        responseCode: "30",
      };
    }

    expectedOutcome = expectedOutcomeFromMerchant(merchantResult);
    reportInput = reportInputFromMerchant(
      transactionReference,
      merchantResult,
      input.order,
    );
  }

  const progress = {
    transactionReference,
    expectedOutcome,
  } satisfies PravaProgressIssueState;
  let report;

  try {
    report = await input.client.reportStatus(
      input.sessionId,
      reportInput,
      undefined,
    );
  } catch {
    return recoverAfterReportError(input, progress);
  }

  if (
    !confirmedReportMatches(
      report,
      reportInput.status,
      transactionReference,
    )
  ) {
    return { status: "reconciliation_required", progress };
  }

  const confirmation = await boundedPoll(
    input.client,
    input.sessionId,
    CONFIRMATION_POLL_ATTEMPTS,
    undefined,
  );

  if (!confirmation.ok) {
    if (confirmation.state === "confirmed_pending") {
      return {
        status: "pending",
        providerConfirmed: true,
        progress,
      };
    }

    return confirmation.retryable
      ? { status: "pending", providerConfirmed: false, progress }
      : { status: "reconciliation_required", progress };
  }

  if (
    confirmation.result.status === "completed" ||
    confirmation.result.status === "failed"
  ) {
    return preserveProgressForReconciliation(
      terminalFromProviderState(
        confirmation.result,
        input,
        expectedOutcome,
      ),
      progress,
    );
  }

  return { status: "pending", providerConfirmed: false, progress };
}

/**
 * Coalesces concurrent callbacks for one provider session within a running
 * server process. Prava state is still queried on every later retry, so this
 * is a best-effort concurrency guard rather than a database substitute.
 */
export function finalizePravaCheckoutOnce(
  input: FinalizePravaCheckoutInput,
): Promise<PravaFinalizationOutcome> {
  const existing = activeFinalizations.get(input.sessionId);

  if (existing) {
    return existing;
  }

  const operation = finalizePravaCheckout(input).finally(() => {
    if (activeFinalizations.get(input.sessionId) === operation) {
      activeFinalizations.delete(input.sessionId);
    }
  });

  activeFinalizations.set(input.sessionId, operation);
  return operation;
}
