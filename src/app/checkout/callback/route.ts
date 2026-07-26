import { NextResponse } from "next/server";

import { getServerEnvironment } from "@/lib/config/env";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

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

function resultRedirect(appUrl: string) {
  return NextResponse.redirect(
    new URL("/checkout/result", appUrl),
    { status: 303, headers: NO_STORE_HEADERS },
  );
}

/**
 * A Prava callback without its attempt-scoped path locator fails closed. No
 * query value can select or authorize a payment attempt.
 */
export async function GET() {
  let environment: ReturnType<typeof getServerEnvironment>;

  try {
    environment = getServerEnvironment();
  } catch {
    return errorResponse();
  }

  return resultRedirect(environment.appUrl);
}
