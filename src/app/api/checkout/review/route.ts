import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { CheckoutReviewRequestSchema } from "@/lib/checkout/api-contracts";
import {
  clearCheckoutCookie,
  readCheckoutBrowserId,
  setCheckoutBrowserId,
  setCheckoutCookie,
} from "@/lib/checkout/cookies";
import { verifyCheckoutOrder } from "@/lib/checkout/order";
import {
  guardCheckoutPostRequest,
  type CheckoutRequestGuardErrorCode,
} from "@/lib/checkout/request-guard";
import { issueCheckoutToken } from "@/lib/checkout/token";
import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type ReviewErrorCode =
  | "INVALID_JSON"
  | "INVALID_CHECKOUT_REQUEST"
  | "CHECKOUT_STATE_INVALID"
  | "CHECKOUT_CONFIGURATION_INVALID"
  | CheckoutRequestGuardErrorCode;

function errorResponse(
  status: number,
  code: ReviewErrorCode,
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

  const parsed = CheckoutReviewRequestSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      400,
      "INVALID_CHECKOUT_REQUEST",
      "Choose a complete outfit and try again.",
    );
  }

  const verified = verifyCheckoutOrder(parsed.data);

  if (!verified.ok) {
    return errorResponse(
      409,
      "CHECKOUT_STATE_INVALID",
      "This outfit can no longer be checked out. Choose another outfit.",
    );
  }

  try {
    const browserId =
      (await readCheckoutBrowserId(request)) ?? randomUUID();
    const token = issueCheckoutToken(
      verified.order,
      environment.checkoutSigningSecret,
    );
    const response = NextResponse.json(
      {
        ok: true,
        reviewUrl: "/checkout/review",
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );

    await setCheckoutCookie(
      response,
      "review",
      token,
      environment.nodeEnv,
    );
    await setCheckoutBrowserId(
      response,
      browserId,
      environment.nodeEnv,
    );
    await clearCheckoutCookie(
      response,
      "session",
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
      500,
      "CHECKOUT_CONFIGURATION_INVALID",
      "Checkout is not configured for this environment.",
    );
  }
}
