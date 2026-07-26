import { NextRequest, NextResponse } from "next/server";

import { CheckoutApprovalRequestSchema } from "@/lib/checkout/api-contracts";
import {
  clearCheckoutCookie,
  readCheckoutCookie,
  setCheckoutCookie,
} from "@/lib/checkout/cookies";
import { publicHostedCheckoutUrl } from "@/lib/checkout/hosted-url";
import {
  guardCheckoutPostRequest,
  type CheckoutRequestGuardErrorCode,
} from "@/lib/checkout/request-guard";
import { resolveCheckoutState } from "@/lib/checkout/state";
import { issuePaymentSessionToken } from "@/lib/checkout/workflow";
import { getServerEnvironment } from "@/lib/config/env";
import { resolvePaymentProvider } from "@/lib/payments/factory";

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
  | "PAYMENT_SESSION_FAILED"
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

  const resolution = resolvePaymentProvider({
    provider: environment.paymentProvider,
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

  try {
    const session = await resolution.provider.createSession(
      {
        order: checkout.order,
        email: approval.data.email,
        callbackUrl: new URL(
          "/checkout/callback",
          environment.appUrl,
        ).toString(),
      },
      request.signal,
    );
    const hostedUrl =
      session.provider === environment.paymentProvider
        ? publicHostedCheckoutUrl({
            provider: session.provider,
            hostedUrl: session.hostedUrl,
            appOrigin: environment.appUrl,
            pravaOrigin: environment.prava.baseUrl,
          })
        : undefined;

    if (!hostedUrl) {
      return errorResponse(
        502,
        "PAYMENT_SESSION_FAILED",
        "The payment provider could not create a safe checkout session.",
      );
    }

    const sessionToken = issuePaymentSessionToken(
      {
        checkoutClaims: checkout.claims,
        session,
      },
      environment.checkoutSigningSecret,
    );
    const response = NextResponse.json(
      {
        ok: true,
        provider: session.provider,
        hostedUrl,
        expiresAt: session.expiresAt,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );

    await setCheckoutCookie(
      response,
      "session",
      sessionToken,
      environment.nodeEnv,
    );
    await clearCheckoutCookie(
      response,
      "result",
      environment.nodeEnv,
    );

    return response;
  } catch {
    return errorResponse(
      502,
      "PAYMENT_SESSION_FAILED",
      "The payment provider could not create a checkout session.",
    );
  }
}
