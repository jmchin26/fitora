import { NextRequest, NextResponse } from "next/server";

import { CheckoutApprovalRequestSchema } from "@/lib/checkout/api-contracts";
import {
  MAX_ACTIVE_PRAVA_ATTEMPTS,
  clearCheckoutCookie,
  clearCheckoutAttemptCookie,
  listCheckoutAttemptCookieSets,
  readCheckoutBrowserId,
  readCheckoutCookie,
  readCheckoutAttemptCookie,
  setCheckoutCookie,
  setCheckoutAttemptCookie,
  type CheckoutCookieKind,
} from "@/lib/checkout/cookies";
import { publicHostedCheckoutUrl } from "@/lib/checkout/hosted-url";
import {
  PravaCreationRateLimitError,
  derivePravaCreationClientKey,
  pravaCreationThrottle,
} from "@/lib/checkout/prava-creation-throttle";
import { verifyPravaProgressTokenForCheckout } from "@/lib/checkout/prava-progress";
import { verifyPravaReconciliationTokenForCheckout } from "@/lib/checkout/prava-reconciliation";
import {
  PravaSessionAlreadyActiveError,
  PravaSessionCapacityError,
  createPravaSessionOnce,
} from "@/lib/checkout/prava-session-creation";
import {
  guardCheckoutPostRequest,
  type CheckoutRequestGuardErrorCode,
} from "@/lib/checkout/request-guard";
import { resolveCheckoutState } from "@/lib/checkout/state";
import {
  CHECKOUT_TOKEN_MAX_TTL_SECONDS,
  issueCheckoutToken,
  verifyCheckoutToken,
} from "@/lib/checkout/token";
import {
  PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS,
  issuePaymentSessionToken,
  verifyCheckoutResultToken,
  verifyPendingCheckoutResultTokenForCheckout,
  verifyPaymentSessionTokenForCheckout,
} from "@/lib/checkout/workflow";
import { getServerEnvironment } from "@/lib/config/env";
import { resolvePaymentProvider } from "@/lib/payments/factory";
import {
  derivePravaUserId,
  isPravaClientError,
} from "@/lib/payments/prava";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type SessionErrorCode =
  | "INVALID_JSON"
  | "INVALID_CHECKOUT_REQUEST"
  | "CHECKOUT_STATE_MISSING"
  | "CHECKOUT_STATE_INVALID"
  | "CHECKOUT_STATE_EXPIRED"
  | "CHECKOUT_PRICE_CHANGED"
  | "CHECKOUT_ORDER_UNAVAILABLE"
  | "CHECKOUT_CONFIGURATION_INVALID"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_ATTEMPT_LIMIT_REACHED"
  | "PAYMENT_SESSION_ACTIVE"
  | "PAYMENT_SESSION_FAILED"
  | "PAYMENT_SESSION_UNCERTAIN"
  | CheckoutRequestGuardErrorCode;

function errorResponse(
  status: number,
  code: SessionErrorCode,
  message: string,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: NO_STORE_HEADERS,
    },
  );
}

type AttemptCookieCleanup = Readonly<{
  attemptId: string;
  kinds: readonly CheckoutCookieKind[];
}>;

type PravaAttemptCookieBudget = Readonly<{
  activeAttemptIds: ReadonlySet<string>;
  cleanup: readonly AttemptCookieCleanup[];
}>;

async function inspectPravaAttemptCookieBudget(
  request: NextRequest,
  signingSecret: string,
): Promise<PravaAttemptCookieBudget> {
  const sets = await listCheckoutAttemptCookieSets(request);
  const activeAttemptIds = new Set<string>();
  const cleanup = new Map<string, Set<CheckoutCookieKind>>();

  const markForCleanup = (
    attemptId: string,
    kinds: readonly CheckoutCookieKind[],
  ) => {
    const marked =
      cleanup.get(attemptId) ?? new Set<CheckoutCookieKind>();

    for (const kind of kinds) {
      marked.add(kind);
    }

    cleanup.set(attemptId, marked);
  };

  for (const set of sets) {
    if (set.invalidKinds.length > 0) {
      markForCleanup(set.attemptId, set.presentKinds);
      continue;
    }

    const reviewToken = set.values.review;
    const sessionToken = set.values.session;

    // A terminal result is result-only by design. Any other partial pair is
    // orphaned and cannot authorize a retry, so all present state is expired.
    if (!reviewToken || !sessionToken) {
      markForCleanup(set.attemptId, set.presentKinds);
      continue;
    }

    const checkout = verifyCheckoutToken(
      reviewToken,
      signingSecret,
    );

    if (!checkout.ok) {
      markForCleanup(set.attemptId, set.presentKinds);
      continue;
    }

    const session = verifyPaymentSessionTokenForCheckout(
      sessionToken,
      checkout.claims,
      signingSecret,
    );

    if (
      !session.ok ||
      session.claims.provider !== "prava" ||
      session.claims.attemptId !== set.attemptId
    ) {
      markForCleanup(set.attemptId, set.presentKinds);
      continue;
    }

    const resultToken = set.values.result;

    if (resultToken) {
      // A signed terminal result means this attempt is finished even if a
      // browser retained its transient pair. Remove the complete set.
      const terminal = verifyCheckoutResultToken(
        resultToken,
        signingSecret,
      );

      if (terminal.ok) {
        markForCleanup(set.attemptId, set.presentKinds);
        continue;
      }

      const order = session.claims.order;
      const pending = verifyPendingCheckoutResultTokenForCheckout(
        resultToken,
        checkout.claims,
        session.claims,
        order,
        signingSecret,
      );
      const progress = verifyPravaProgressTokenForCheckout(
        resultToken,
        checkout.claims,
        session.claims,
        order,
        signingSecret,
      );
      const reconciliation =
        verifyPravaReconciliationTokenForCheckout(
          resultToken,
          checkout.claims,
          session.claims,
          order,
          signingSecret,
        );

      if (!pending.ok && !progress.ok && !reconciliation.ok) {
        // An invalid or expired marker cannot terminate an otherwise valid
        // active pair. Prune only the marker and retain the protected session.
        markForCleanup(set.attemptId, ["result"]);
      }
    }

    activeAttemptIds.add(set.attemptId);
  }

  return {
    activeAttemptIds,
    cleanup: [...cleanup.entries()].map(([attemptId, kinds]) => ({
      attemptId,
      kinds: [...kinds],
    })),
  };
}

async function applyAttemptCookieCleanup(
  response: NextResponse,
  cleanup: readonly AttemptCookieCleanup[],
  nodeEnv: ReturnType<typeof getServerEnvironment>["nodeEnv"],
): Promise<void> {
  for (const item of cleanup) {
    for (const kind of item.kinds) {
      await clearCheckoutAttemptCookie(
        response,
        kind,
        item.attemptId,
        nodeEnv,
      );
    }
  }
}

function checkoutStateError(
  reason:
    | "MISSING"
    | "INVALID"
    | "EXPIRED"
    | "NOT_YET_VALID"
    | "ORDER_UNAVAILABLE"
    | "ORDER_CHANGED",
) {
  switch (reason) {
    case "MISSING":
      return errorResponse(
        401,
        "CHECKOUT_STATE_MISSING",
        "Review the outfit before starting payment.",
      );
    case "EXPIRED":
      return errorResponse(
        410,
        "CHECKOUT_STATE_EXPIRED",
        "The checkout review expired. Review the outfit again.",
      );
    case "ORDER_UNAVAILABLE":
      return errorResponse(
        409,
        "CHECKOUT_ORDER_UNAVAILABLE",
        "One or more items are no longer available. Choose another outfit.",
      );
    case "ORDER_CHANGED":
      return errorResponse(
        409,
        "CHECKOUT_PRICE_CHANGED",
        "The order changed. Review the latest price before paying.",
      );
    case "INVALID":
    case "NOT_YET_VALID":
      return errorResponse(
        401,
        "CHECKOUT_STATE_INVALID",
        "The checkout review could not be verified. Review the outfit again.",
      );
  }
}

export async function POST(request: NextRequest) {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return errorResponse(
      500,
      "CHECKOUT_CONFIGURATION_INVALID",
      "Checkout is not configured for this environment.",
    );
  }

  const requestGuard = guardCheckoutPostRequest(request, {
    appOrigin: environment.appUrl,
    nodeEnv: environment.nodeEnv,
  });

  if (!requestGuard.ok) {
    return errorResponse(
      requestGuard.status,
      requestGuard.error.code,
      requestGuard.error.message,
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }

  const approval = CheckoutApprovalRequestSchema.safeParse(body);

  if (!approval.success) {
    return errorResponse(
      400,
      "INVALID_CHECKOUT_REQUEST",
      "Enter a valid email address to continue.",
    );
  }

  const reviewToken = await readCheckoutCookie(request, "review");
  const checkout = resolveCheckoutState(
    reviewToken,
    environment.checkoutSigningSecret,
  );

  if (!checkout.ok) {
    return checkoutStateError(checkout.reason);
  }

  if (approval.data.reviewId !== checkout.claims.jti) {
    return errorResponse(
      409,
      "CHECKOUT_STATE_INVALID",
      "This checkout review is no longer current. Reload and review the verified order before continuing.",
    );
  }

  const checkoutBrowserId =
    environment.paymentProvider === "prava"
      ? await readCheckoutBrowserId(request)
      : undefined;

  if (
    environment.paymentProvider === "prava" &&
    !checkoutBrowserId
  ) {
    return errorResponse(
      409,
      "CHECKOUT_STATE_INVALID",
      "This browser checkout state is incomplete. Reload the verified review before continuing.",
    );
  }

  if (environment.paymentProvider === "prava") {
    const existingSessionToken = await readCheckoutAttemptCookie(
      request,
      "session",
      approval.data.attemptId,
    );
    const existingSession = verifyPaymentSessionTokenForCheckout(
      existingSessionToken,
      checkout.claims,
      environment.checkoutSigningSecret,
    );

    if (
      existingSession.ok &&
      existingSession.claims.provider === "prava" &&
      existingSession.claims.attemptId === approval.data.attemptId
    ) {
      return errorResponse(
        409,
        "PAYMENT_SESSION_ACTIVE",
        "A Prava payment session is already active. Finish it in the original payment tab or wait for it to expire.",
      );
    }
  }

  const resolution = resolvePaymentProvider({
    provider: environment.paymentProvider,
    serverEnvironment: environment,
    appUrl: environment.appUrl,
    forceMerchantDecline: environment.merchant.forceDecline,
  });

  if (resolution.status === "unavailable") {
    return errorResponse(
      503,
      "PAYMENT_PROVIDER_UNAVAILABLE",
      "The selected payment provider is not available yet.",
    );
  }

  if (resolution.status === "invalid") {
    return errorResponse(
      500,
      "CHECKOUT_CONFIGURATION_INVALID",
      "Checkout is not configured for this environment.",
    );
  }

  const pravaCookieBudget =
    environment.paymentProvider === "prava"
      ? await inspectPravaAttemptCookieBudget(
          request,
          environment.checkoutSigningSecret,
        )
      : undefined;

  if (
    pravaCookieBudget &&
    pravaCookieBudget.activeAttemptIds.size >=
      MAX_ACTIVE_PRAVA_ATTEMPTS
  ) {
    const response = errorResponse(
      409,
      "PAYMENT_ATTEMPT_LIMIT_REACHED",
      "Three Prava payment sessions are already active. Finish one in its original tab or wait for it to expire before starting another.",
    );

    await applyAttemptCookieCleanup(
      response,
      pravaCookieBudget.cleanup,
      environment.nodeEnv,
    );
    return response;
  }

  if (environment.paymentProvider === "prava") {
    for (const item of pravaCookieBudget?.cleanup ?? []) {
      pravaCreationThrottle.release({
        attemptId: item.attemptId,
        browserId: checkoutBrowserId,
      });
    }

    try {
      pravaCreationThrottle.consume({
        activeAttemptIds:
          pravaCookieBudget?.activeAttemptIds ?? new Set<string>(),
        attemptId: approval.data.attemptId,
        browserId: checkoutBrowserId,
        checkoutJti: checkout.claims.jti,
        clientKey: derivePravaCreationClientKey(
          request.headers,
          environment.checkoutSigningSecret,
          { nodeEnv: environment.nodeEnv },
        ),
      });
    } catch (error) {
      if (!(error instanceof PravaCreationRateLimitError)) {
        throw error;
      }

      const response = errorResponse(
        429,
        "PAYMENT_ATTEMPT_LIMIT_REACHED",
        "Too many Prava payment attempts were started recently. Finish the active attempt or wait before trying again.",
      );
      response.headers.set(
        "Retry-After",
        String(error.retryAfterSeconds),
      );
      await applyAttemptCookieCleanup(
        response,
        pravaCookieBudget?.cleanup ?? [],
        environment.nodeEnv,
      );
      return response;
    }
  }

  try {
    const createSessionInput = {
      order: checkout.order,
      email: approval.data.email,
      callbackUrl: new URL(
        environment.paymentProvider === "prava"
          ? `/checkout/callback/${approval.data.attemptId}`
          : "/checkout/callback",
        environment.appUrl,
      ).toString(),
    };
    const issueAttemptState = async (
      signal: AbortSignal,
      preserveReviewJti: boolean,
    ) => {
      const session = await resolution.provider.createSession(
        createSessionInput,
        signal,
      );
      const hostedUrl =
        session.provider === environment.paymentProvider
          ? publicHostedCheckoutUrl({
              provider: session.provider,
              hostedUrl: session.hostedUrl,
              appOrigin: environment.appUrl,
              pravaOrigin:
                environment.prava.hostedCheckoutOrigin ??
                environment.prava.baseUrl,
            })
          : undefined;

      if (!hostedUrl) {
        throw new Error(
          "The provider returned an unsafe hosted checkout URL.",
        );
      }

      const nowEpochSeconds = Math.floor(Date.now() / 1_000);
      const providerExpiresAt = Math.floor(
        Date.parse(session.expiresAt) / 1_000,
      );
      const refreshedReviewTtlSeconds = Math.min(
        CHECKOUT_TOKEN_MAX_TTL_SECONDS,
        providerExpiresAt - nowEpochSeconds,
      );
      const refreshedReviewToken = issueCheckoutToken(
        checkout.order,
        environment.checkoutSigningSecret,
        {
          nowEpochSeconds,
          ttlSeconds: refreshedReviewTtlSeconds,
          ...(preserveReviewJti
            ? { jti: checkout.claims.jti }
            : {}),
        },
      );
      const refreshedReview = verifyCheckoutToken(
        refreshedReviewToken,
        environment.checkoutSigningSecret,
        { nowEpochSeconds },
      );

      if (!refreshedReview.ok) {
        throw new Error(
          "The approved checkout state could not be refreshed.",
        );
      }

      const sessionToken = issuePaymentSessionToken(
        {
          attemptId: approval.data.attemptId,
          checkoutClaims: refreshedReview.claims,
          order: checkout.order,
          session,
        },
        environment.checkoutSigningSecret,
        {
          nowEpochSeconds,
          ttlSeconds: PAYMENT_SESSION_TOKEN_MAX_TTL_SECONDS,
        },
      );

      return {
        session,
        hostedUrl,
        reviewToken: refreshedReviewToken,
        sessionToken,
      };
    };
    const attempt =
      environment.paymentProvider === "prava"
        ? await createPravaSessionOnce({
            attemptId: approval.data.attemptId,
            checkoutJti: checkout.claims.jti,
            approvalFingerprint: derivePravaUserId(
              approval.data.email,
              environment.checkoutSigningSecret,
            ),
            // Session creation is side-effecting. Once it starts, rely on the
            // provider client's own bounded timeout instead of a browser
            // disconnect that could leave the outcome ambiguous.
            create: () =>
              issueAttemptState(
                new AbortController().signal,
                true,
              ),
          })
        : await issueAttemptState(request.signal, false);
    const response = NextResponse.json(
      {
        ok: true,
        provider: attempt.session.provider,
        hostedUrl: attempt.hostedUrl,
        expiresAt: attempt.session.expiresAt,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );

    if (environment.paymentProvider === "prava") {
      await applyAttemptCookieCleanup(
        response,
        pravaCookieBudget?.cleanup ?? [],
        environment.nodeEnv,
      );
      await setCheckoutAttemptCookie(
        response,
        "review",
        approval.data.attemptId,
        attempt.reviewToken,
        environment.nodeEnv,
      );
      await setCheckoutAttemptCookie(
        response,
        "session",
        approval.data.attemptId,
        attempt.sessionToken,
        environment.nodeEnv,
      );
      await clearCheckoutAttemptCookie(
        response,
        "result",
        approval.data.attemptId,
        environment.nodeEnv,
      );
    } else {
      await setCheckoutCookie(
        response,
        "review",
        attempt.reviewToken,
        environment.nodeEnv,
      );
      await setCheckoutCookie(
        response,
        "session",
        attempt.sessionToken,
        environment.nodeEnv,
      );
      await clearCheckoutCookie(
        response,
        "result",
        environment.nodeEnv,
      );
    }

    return response;
  } catch (error) {
    if (
      error instanceof PravaSessionAlreadyActiveError ||
      error instanceof PravaSessionCapacityError
    ) {
      const response = errorResponse(
        error instanceof PravaSessionAlreadyActiveError ? 409 : 429,
        error instanceof PravaSessionAlreadyActiveError
          ? "PAYMENT_SESSION_ACTIVE"
          : "PAYMENT_ATTEMPT_LIMIT_REACHED",
        error instanceof PravaSessionAlreadyActiveError
          ? "A Prava payment session is already active. Finish it in the original payment tab or wait for it to expire."
          : "Prava session creation is temporarily at capacity. Wait before trying again.",
      );

      if (error instanceof PravaSessionCapacityError) {
        response.headers.set("Retry-After", "1200");
        pravaCreationThrottle.release({
          attemptId: approval.data.attemptId,
          browserId: checkoutBrowserId,
          checkoutJti: checkout.claims.jti,
        });
      }

      await applyAttemptCookieCleanup(
        response,
        pravaCookieBudget?.cleanup ?? [],
        environment.nodeEnv,
      );
      return response;
    }

    if (
      environment.paymentProvider === "prava" &&
      isPravaClientError(error) &&
      error.operation === "create_session" &&
      error.code === "HTTP_ERROR" &&
      error.status !== undefined &&
      error.status < 500 &&
      error.status !== 408
    ) {
      pravaCreationThrottle.release({
        attemptId: approval.data.attemptId,
        browserId: checkoutBrowserId,
        checkoutJti: checkout.claims.jti,
      });
      const response = errorResponse(
        error.status === 429 ? 429 : 502,
        error.status === 429
          ? "PAYMENT_ATTEMPT_LIMIT_REACHED"
          : "PAYMENT_SESSION_FAILED",
        error.status === 429
          ? "Prava is temporarily rate limiting session creation. Wait before trying again."
          : "Prava rejected the session request before creating a checkout.",
      );

      if (error.status === 429) {
        response.headers.set("Retry-After", "600");
      }

      await applyAttemptCookieCleanup(
        response,
        pravaCookieBudget?.cleanup ?? [],
        environment.nodeEnv,
      );
      return response;
    }

    if (environment.paymentProvider === "prava") {
      const response = errorResponse(
        503,
        "PAYMENT_SESSION_UNCERTAIN",
        "Fitora could not confirm whether the Prava session was created. Do not retry this attempt until it expires.",
      );

      await applyAttemptCookieCleanup(
        response,
        pravaCookieBudget?.cleanup ?? [],
        environment.nodeEnv,
      );
      return response;
    }

    return errorResponse(
      502,
      "PAYMENT_SESSION_FAILED",
      "The payment provider could not create a checkout session.",
    );
  }
}
