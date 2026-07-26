export const CHECKOUT_REQUEST_GUARD_ERROR_CODES = [
  "INVALID_CONTENT_TYPE",
  "INVALID_REQUEST_ORIGIN",
] as const;

export type CheckoutRequestGuardErrorCode =
  (typeof CHECKOUT_REQUEST_GUARD_ERROR_CODES)[number];

export type CheckoutRequestGuardResult =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 415;
      error: {
        code: CheckoutRequestGuardErrorCode;
        message: string;
      };
    };

type CheckoutRequestGuardOptions = {
  appOrigin: string;
  nodeEnv: "development" | "test" | "production";
};

function invalidContentType(): CheckoutRequestGuardResult {
  return {
    ok: false,
    status: 415,
    error: {
      code: "INVALID_CONTENT_TYPE",
      message: "Checkout requests must use application/json.",
    },
  };
}

function invalidOrigin(): CheckoutRequestGuardResult {
  return {
    ok: false,
    status: 403,
    error: {
      code: "INVALID_REQUEST_ORIGIN",
      message: "The checkout request origin could not be verified.",
    },
  };
}

/**
 * Browser checkout mutations must be same-origin JSON requests. Direct
 * server/test callers may omit Origin outside production, but a supplied
 * Origin is always checked. Production never accepts an omitted Origin.
 */
export function guardCheckoutPostRequest(
  request: Pick<Request, "headers">,
  options: CheckoutRequestGuardOptions,
): CheckoutRequestGuardResult {
  const contentType = request.headers.get("Content-Type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    return invalidContentType();
  }

  let configuredOrigin: string;

  try {
    const parsed = new URL(options.appOrigin);

    if (parsed.origin !== options.appOrigin) {
      return invalidOrigin();
    }

    configuredOrigin = parsed.origin;
  } catch {
    return invalidOrigin();
  }

  const requestOrigin = request.headers.get("Origin");

  if (!requestOrigin) {
    return options.nodeEnv === "production"
      ? invalidOrigin()
      : { ok: true };
  }

  return requestOrigin === configuredOrigin
    ? { ok: true }
    : invalidOrigin();
}
