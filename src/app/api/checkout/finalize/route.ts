import { NextRequest, NextResponse } from "next/server";

import { MockFinalizeRequestSchema } from "@/lib/checkout/api-contracts";
import {
  clearCheckoutCookie,
  readCheckoutCookie,
  setCheckoutCookie,
} from "@/lib/checkout/cookies";
import {
  guardCheckoutPostRequest,
  type CheckoutRequestGuardErrorCode,
} from "@/lib/checkout/request-guard";
import { resolveCheckoutState } from "@/lib/checkout/state";
import {
  checkoutResultFromClaims,
  issuePendingCheckoutResult,
  issueTerminalCheckoutResult,
  verifyCheckoutResultToken,
  verifyPaymentSessionTokenForCheckout,
} from "@/lib/checkout/workflow";
import { getServerEnvironment } from "@/lib/config/env";
import { resolvePaymentProvider } from "@/lib/payments/factory";
import { PaymentResultSchema } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type FinalizeErrorCode =
  | "INVALID_JSON"
  | "INVALID_CHECKOUT_REQUEST"
  | "CHECKOUT_STATE_MISSING"
  | "CHECKOUT_STATE_INVALID"
  | "CHECKOUT_STATE_EXPIRED"
  | "CHECKOUT_PRICE_CHANGED"
  | "CHECKOUT_ORDER_UNAVAILABLE"
  | "CHECKOUT_CONFIGURATION_INVALID"
  | "PAYMENT_FINALIZE_NOT_ALLOWED"
  | "PAYMENT_PROVIDER_UNAVAILABLE"
  | "PAYMENT_FINALIZE_FAILED"
  | CheckoutRequestGuardErrorCode;

function errorResponse(
  status: number,
  code: FinalizeErrorCode,
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

function finalizedResponse(
  status: "pending" | "approved" | "declined",
) {
  return NextResponse.json(
    {
      ok: true,
      status,
      redirectUrl: "/checkout/result",
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
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
        "Review the outfit before completing payment.",
      );
    case "EXPIRED":
      return errorResponse(
        410,
        "CHECKOUT_STATE_EXPIRED",
        "The checkout state expired. Review the outfit again.",
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
        "The checkout state could not be verified. Review the outfit again.",
      );
  }
}

function paymentSessionError(
  code:
    | "TOKEN_INVALID"
    | "TOKEN_EXPIRED"
    | "TOKEN_NOT_YET_VALID"
    | "PAYMENT_SESSION_BINDING_MISMATCH",
) {
  if (code === "TOKEN_EXPIRED") {
    return errorResponse(
      410,
      "CHECKOUT_STATE_EXPIRED",
      "The payment session expired. Start payment again.",
    );
  }

  return errorResponse(
    401,
    "CHECKOUT_STATE_INVALID",
    "The payment session could not be verified. Start payment again.",
  );
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

  if (environment.paymentProvider !== "mock") {
    return errorResponse(
      409,
      "PAYMENT_FINALIZE_NOT_ALLOWED",
      "Real hosted payments are finalized only after the provider callback.",
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

  const decision = MockFinalizeRequestSchema.safeParse(body);

  if (!decision.success) {
    return errorResponse(
      400,
      "INVALID_CHECKOUT_REQUEST",
      "Choose approve or decline to complete mock payment.",
    );
  }

  const [existingResultToken, reviewToken, sessionToken] =
    await Promise.all([
      readCheckoutCookie(request, "result"),
      readCheckoutCookie(request, "review"),
      readCheckoutCookie(request, "session"),
    ]);

  if (existingResultToken && !reviewToken && !sessionToken) {
    const existingResult = verifyCheckoutResultToken(
      existingResultToken,
      environment.checkoutSigningSecret,
    );

    if (existingResult.ok) {
      const result = checkoutResultFromClaims(existingResult.claims);

      if (result) {
        return finalizedResponse(result.status);
      }
    }
  }

  const checkout = resolveCheckoutState(
    reviewToken,
    environment.checkoutSigningSecret,
  );

  if (!checkout.ok) {
    return checkoutStateError(checkout.reason);
  }

  if (!sessionToken) {
    return errorResponse(
      401,
      "CHECKOUT_STATE_MISSING",
      "Start a payment session before completing payment.",
    );
  }

  const session = verifyPaymentSessionTokenForCheckout(
    sessionToken,
    checkout.claims,
    environment.checkoutSigningSecret,
  );

  if (!session.ok) {
    return paymentSessionError(session.error.code);
  }

  if (session.claims.provider !== environment.paymentProvider) {
    return errorResponse(
      401,
      "CHECKOUT_STATE_INVALID",
      "The payment session does not match the configured provider.",
    );
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

  if (resolution.provider.name !== session.claims.provider) {
    return errorResponse(
      401,
      "CHECKOUT_STATE_INVALID",
      "The payment session does not match the configured provider.",
    );
  }

  try {
    // Cookie-scoped replay protection cannot globally deduplicate concurrent
    // requests or a response lost after merchant execution. Phase 5 must query
    // real provider state and use merchant idempotency before re-executing.
    const providerResult = await resolution.provider.finalize(
      {
        order: checkout.order,
        sessionId: session.claims.sessionId,
        decision: decision.data.decision,
      },
      request.signal,
    );
    const parsedResult = PaymentResultSchema.safeParse(providerResult);

    if (
      !parsedResult.success ||
      parsedResult.data.provider !== session.claims.provider ||
      parsedResult.data.sessionId !== session.claims.sessionId
    ) {
      return errorResponse(
        502,
        "PAYMENT_FINALIZE_FAILED",
        "The payment provider returned an invalid result.",
      );
    }

    if (parsedResult.data.status === "pending") {
      const issued = issuePendingCheckoutResult(
        {
          checkoutClaims: checkout.claims,
          sessionClaims: session.claims,
          order: checkout.order,
          paymentResult: parsedResult.data,
        },
        environment.checkoutSigningSecret,
      );
      const response = finalizedResponse("pending");

      await setCheckoutCookie(
        response,
        "result",
        issued.token,
        environment.nodeEnv,
      );

      return response;
    }

    const issued = issueTerminalCheckoutResult(
      checkout.order,
      parsedResult.data,
      environment.checkoutSigningSecret,
    );
    const response = finalizedResponse(issued.result.status);

    await setCheckoutCookie(
      response,
      "result",
      issued.token,
      environment.nodeEnv,
    );
    await clearCheckoutCookie(
      response,
      "review",
      environment.nodeEnv,
    );
    await clearCheckoutCookie(
      response,
      "session",
      environment.nodeEnv,
    );

    return response;
  } catch {
    return errorResponse(
      502,
      "PAYMENT_FINALIZE_FAILED",
      "The payment provider could not complete payment.",
    );
  }
}
