import { NextRequest, NextResponse } from "next/server";

import {
  clearCheckoutAttemptCookie,
  isCheckoutAttemptId,
  readCheckoutBrowserId,
  readCheckoutAttemptCookie,
  setCheckoutAttemptCookie,
} from "@/lib/checkout/cookies";
import { pravaCreationThrottle } from "@/lib/checkout/prava-creation-throttle";
import { finalizePravaCheckoutOnce } from "@/lib/checkout/prava-finalization";
import {
  issuePravaProgressToken,
  verifyPravaProgressTokenForCheckout,
} from "@/lib/checkout/prava-progress";
import {
  issuePravaReconciliationToken,
  verifyPravaReconciliationTokenForCheckout,
} from "@/lib/checkout/prava-reconciliation";
import { resolveCheckoutState } from "@/lib/checkout/state";
import { verifyCheckoutToken } from "@/lib/checkout/token";
import {
  issuePendingCheckoutResult,
  issueTerminalCheckoutResult,
  verifyCheckoutResultToken,
  verifyPendingCheckoutResultTokenForCheckout,
  verifyPaymentSessionTokenForCheckout,
} from "@/lib/checkout/workflow";
import { getServerEnvironment } from "@/lib/config/env";
import { createPravaDemoMerchant } from "@/lib/merchant/prava-demo-merchant";
import { createPravaClient } from "@/lib/payments/prava";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

type CallbackContext = Readonly<{
  params: Promise<{ attemptId: string }>;
}>;

function errorResponse() {
  return NextResponse.json(
    {
      error: {
        code: "CHECKOUT_CONFIGURATION_INVALID",
        message: "Checkout is not configured for this environment.",
      },
    },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

function resultRedirect(appUrl: string, attemptId?: string) {
  const resultUrl = new URL("/checkout/result", appUrl);

  if (attemptId) {
    resultUrl.searchParams.set("attempt", attemptId);
  }

  return NextResponse.redirect(resultUrl, {
    status: 303,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * The path segment is an opaque cookie locator, never payment truth. Every
 * provider query and result still requires mutually bound HMAC state. Query
 * parameters from the browser redirect are deliberately ignored.
 */
export async function GET(
  request: NextRequest,
  context: CallbackContext,
) {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return errorResponse();
  }

  const { attemptId } = await context.params;

  if (!isCheckoutAttemptId(attemptId)) {
    return resultRedirect(environment.appUrl);
  }

  if (
    environment.paymentProvider !== "prava" ||
    !environment.prava.secretKey
  ) {
    return resultRedirect(environment.appUrl, attemptId);
  }

  const [browserId, reviewToken, sessionToken, resultToken] = await Promise.all([
    readCheckoutBrowserId(request),
    readCheckoutAttemptCookie(request, "review", attemptId),
    readCheckoutAttemptCookie(request, "session", attemptId),
    readCheckoutAttemptCookie(request, "result", attemptId),
  ]);
  const checkout = verifyCheckoutToken(
    reviewToken,
    environment.checkoutSigningSecret,
  );

  if (!checkout.ok || !sessionToken) {
    return resultRedirect(environment.appUrl, attemptId);
  }

  const session = verifyPaymentSessionTokenForCheckout(
    sessionToken,
    checkout.claims,
    environment.checkoutSigningSecret,
  );

  if (
    !session.ok ||
    session.claims.provider !== "prava" ||
    session.claims.attemptId !== attemptId
  ) {
    return resultRedirect(environment.appUrl, attemptId);
  }

  const order = session.claims.order;
  const currentCheckout = resolveCheckoutState(
    reviewToken,
    environment.checkoutSigningSecret,
  );
  let existingProgress:
    | Extract<
        ReturnType<typeof verifyPravaProgressTokenForCheckout>,
        { ok: true }
      >["claims"]
    | undefined;

  if (resultToken) {
    const progress = verifyPravaProgressTokenForCheckout(
      resultToken,
      checkout.claims,
      session.claims,
      order,
      environment.checkoutSigningSecret,
    );

    if (progress.ok) {
      existingProgress = progress.claims;
    } else {
      const pending = verifyPendingCheckoutResultTokenForCheckout(
        resultToken,
        checkout.claims,
        session.claims,
        order,
        environment.checkoutSigningSecret,
      );
      const reconciliation =
        verifyPravaReconciliationTokenForCheckout(
          resultToken,
          checkout.claims,
          session.claims,
          order,
          environment.checkoutSigningSecret,
        );
      const terminal = verifyCheckoutResultToken(
        resultToken,
        environment.checkoutSigningSecret,
      );

      if (!pending.ok && !reconciliation.ok && !terminal.ok) {
        const response = resultRedirect(
          environment.appUrl,
          attemptId,
        );
        const marker = issuePravaReconciliationToken(
          {
            checkoutClaims: checkout.claims,
            sessionClaims: session.claims,
            order,
          },
          environment.checkoutSigningSecret,
        );

        await setCheckoutAttemptCookie(
          response,
          "result",
          attemptId,
          marker,
          environment.nodeEnv,
        );
        return response;
      }
    }
  }

  let outcome: Awaited<ReturnType<typeof finalizePravaCheckoutOnce>>;

  try {
    const client = createPravaClient({
      baseUrl: environment.prava.baseUrl,
      secretKey: environment.prava.secretKey,
      userIdSigningSecret: environment.checkoutSigningSecret,
      merchant: {
        name: environment.merchant.name,
        url: environment.merchant.url,
        countryCode: environment.merchant.countryCode,
      },
    });

    outcome = await finalizePravaCheckoutOnce({
      client,
      merchant: createPravaDemoMerchant({
        forceDecline: environment.merchant.forceDecline,
      }),
      merchantProfile: {
        name: environment.merchant.name,
        url: environment.merchant.url,
        countryCode: environment.merchant.countryCode,
      },
      order,
      sessionId: session.claims.sessionId,
      signingSecret: environment.checkoutSigningSecret,
      merchantExecutionAllowed: currentCheckout.ok,
      ...(existingProgress ? { existingProgress } : {}),
    });
  } catch {
    outcome = { status: "reconciliation_required" };
  }

  const response = resultRedirect(environment.appUrl, attemptId);

  if (outcome.status === "terminal") {
    const issued = issueTerminalCheckoutResult(
      order,
      outcome.paymentResult,
      environment.checkoutSigningSecret,
    );

    await setCheckoutAttemptCookie(
      response,
      "result",
      attemptId,
      issued.token,
      environment.nodeEnv,
    );
    await clearCheckoutAttemptCookie(
      response,
      "review",
      attemptId,
      environment.nodeEnv,
    );
    await clearCheckoutAttemptCookie(
      response,
      "session",
      attemptId,
      environment.nodeEnv,
    );
    pravaCreationThrottle.release({
      attemptId,
      browserId,
      checkoutJti: checkout.claims.jti,
    });
    return response;
  }

  if (outcome.progress) {
    const marker = issuePravaProgressToken(
      {
        checkoutClaims: checkout.claims,
        sessionClaims: session.claims,
        order,
        transactionReference: outcome.progress.transactionReference,
        expectedOutcome: outcome.progress.expectedOutcome,
      },
      environment.checkoutSigningSecret,
    );

    await setCheckoutAttemptCookie(
      response,
      "result",
      attemptId,
      marker,
      environment.nodeEnv,
    );
    return response;
  }

  if (outcome.status === "pending" && outcome.providerConfirmed) {
    const issued = issuePendingCheckoutResult(
      {
        checkoutClaims: checkout.claims,
        sessionClaims: session.claims,
        order,
        paymentResult: {
          provider: "prava",
          sessionId: session.claims.sessionId,
          status: "pending",
          retryable: true,
        },
      },
      environment.checkoutSigningSecret,
    );

    await setCheckoutAttemptCookie(
      response,
      "result",
      attemptId,
      issued.token,
      environment.nodeEnv,
    );
    return response;
  }

  const marker = issuePravaReconciliationToken(
    {
      checkoutClaims: checkout.claims,
      sessionClaims: session.claims,
      order,
    },
    environment.checkoutSigningSecret,
  );

  await setCheckoutAttemptCookie(
    response,
    "result",
    attemptId,
    marker,
    environment.nodeEnv,
  );
  return response;
}
