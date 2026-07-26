export const APP_ERROR_CODES = [
  "CATALOG_INVALID",
  "NO_ELIGIBLE_PRODUCTS",
  "NO_OUTFIT_WITHIN_BUDGET",
  "AGENT_PROVIDER_UNAVAILABLE",
  "AGENT_INTENT_INVALID",
  "CHECKOUT_STATE_INVALID",
  "PRAVA_NOT_CONFIGURED",
  "PRAVA_SESSION_FAILED",
  "PRAVA_PENDING",
  "PRAVA_SESSION_EXPIRED",
  "MERCHANT_DECLINED",
  "REPORT_STATUS_FAILED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function toSafeError(error: unknown): {
  code: AppErrorCode | "INTERNAL_ERROR";
  message: string;
  status: number;
} {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    status: 500,
  };
}

