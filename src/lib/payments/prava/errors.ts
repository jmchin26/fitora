export const PRAVA_CLIENT_ERROR_CODES = [
  "INVALID_CONFIGURATION",
  "INVALID_INPUT",
  "REQUEST_ABORTED",
  "REQUEST_TIMEOUT",
  "NETWORK_ERROR",
  "HTTP_ERROR",
  "INVALID_RESPONSE",
  "POLL_EXHAUSTED",
] as const;

export type PravaClientErrorCode =
  (typeof PRAVA_CLIENT_ERROR_CODES)[number];

export const PRAVA_CLIENT_OPERATIONS = [
  "configuration",
  "create_session",
  "get_payment_result",
  "report_status",
  "poll_payment_result",
] as const;

export type PravaClientOperation =
  (typeof PRAVA_CLIENT_OPERATIONS)[number];

const SAFE_ERROR_MESSAGES: Record<PravaClientErrorCode, string> = {
  INVALID_CONFIGURATION: "Prava client configuration is invalid.",
  INVALID_INPUT: "Prava request input is invalid.",
  REQUEST_ABORTED: "The Prava request was cancelled.",
  REQUEST_TIMEOUT: "The Prava request timed out.",
  NETWORK_ERROR: "The Prava API could not be reached.",
  HTTP_ERROR: "The Prava API rejected the request.",
  INVALID_RESPONSE: "The Prava API returned an invalid response.",
  POLL_EXHAUSTED: "The Prava payment result is not ready yet.",
};

type PravaClientErrorOptions = Readonly<{
  status?: number;
  responseId?: string;
  retryable?: boolean;
}>;

/**
 * A deliberately small, serializable error. It never stores a request body,
 * response body, URL, Authorization header, session credential, customer
 * email, or the original exception.
 */
export class PravaClientError extends Error {
  readonly code: PravaClientErrorCode;
  readonly operation: PravaClientOperation;
  readonly status?: number;
  readonly responseId?: string;
  readonly retryable: boolean;

  constructor(
    code: PravaClientErrorCode,
    operation: PravaClientOperation,
    options: PravaClientErrorOptions = {},
  ) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "PravaClientError";
    this.code = code;
    this.operation = operation;
    this.retryable = options.retryable ?? false;

    if (
      options.status !== undefined &&
      Number.isInteger(options.status) &&
      options.status >= 100 &&
      options.status <= 599
    ) {
      this.status = options.status;
    }

    if (options.responseId !== undefined) {
      this.responseId = options.responseId;
    }
  }

  toJSON(): Readonly<{
    name: "PravaClientError";
    code: PravaClientErrorCode;
    operation: PravaClientOperation;
    message: string;
    retryable: boolean;
    status?: number;
    responseId?: string;
  }> {
    return {
      name: "PravaClientError",
      code: this.code,
      operation: this.operation,
      message: this.message,
      retryable: this.retryable,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.responseId === undefined
        ? {}
        : { responseId: this.responseId }),
    };
  }
}

export function isPravaClientError(
  value: unknown,
): value is PravaClientError {
  return value instanceof PravaClientError;
}
