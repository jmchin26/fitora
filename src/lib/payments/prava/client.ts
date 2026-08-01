import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  PravaCreateSessionInputSchema,
  PravaCreatedSessionSchema,
  PravaMerchantSchema,
  PravaSessionIdSchema,
  buildPravaCreateSessionRequest,
  buildPravaReportStatusRequest,
  parsePravaPaymentResult,
  parsePravaReportStatusResult,
  type PravaCreateSessionInput,
  type PravaCreateSessionRequest,
  type PravaCreatedSession,
  type PravaMerchant,
  type PravaPaymentResult,
  type PravaReportStatusInput,
  type PravaReportStatusRequest,
  type PravaReportStatusResult,
} from "@/lib/payments/prava/contracts";
import {
  PravaClientError,
  type PravaClientOperation,
} from "@/lib/payments/prava/errors";
import {
  buildPravaHostedCheckoutUrl,
  resolvePravaEnvironment,
  type PravaEnvironment,
} from "@/lib/payments/prava/hosted-url";
import {
  derivePravaUserId,
  normalizePravaUserEmail,
} from "@/lib/payments/prava/identity";

export const PRAVA_DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const PRAVA_MAX_REQUEST_TIMEOUT_MS = 30_000;
export const PRAVA_DEFAULT_POLL_INTERVAL_MS = 750;
export const PRAVA_DEFAULT_POLL_MAX_ATTEMPTS = 12;
export const PRAVA_MAX_POLL_ATTEMPTS = 30;
export const PRAVA_MAX_RESPONSE_BYTES = 256 * 1_024;

type FetchImplementation = typeof fetch;
type TimerHandle = unknown;
type SetTimer = (callback: () => void, milliseconds: number) => TimerHandle;
type ClearTimer = (handle: TimerHandle) => void;
type Sleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

export type PravaClientConfiguration = Readonly<{
  baseUrl: string;
  secretKey: string;
  userIdSigningSecret: string;
  merchant: PravaMerchant;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
}>;

export type PravaClientDependencies = Readonly<{
  fetch?: FetchImplementation;
  now?: () => number;
  randomUUID?: () => string;
  sleep?: Sleep;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
}>;

export type PravaPollPaymentResultOptions = Readonly<{
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
}>;

export interface PravaClient {
  createSession(
    input: PravaCreateSessionInput,
    signal?: AbortSignal,
  ): Promise<PravaCreatedSession>;
  getPaymentResult(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<PravaPaymentResult>;
  pollPaymentResult(
    sessionId: string,
    options?: PravaPollPaymentResultOptions,
  ): Promise<PravaPaymentResult>;
  reportStatus(
    sessionId: string,
    input: PravaReportStatusInput,
    signal?: AbortSignal,
  ): Promise<PravaReportStatusResult>;
}

const SecretKeySchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^sk_(test|live)_[A-Za-z0-9._~-]{8,}$/);

const SigningSecretSchema = z
  .string()
  .min(32)
  .max(4_096)
  .refine((value) => value === value.trim());

const RequestTimeoutSchema = z
  .number()
  .int()
  .min(100)
  .max(PRAVA_MAX_REQUEST_TIMEOUT_MS);

const PollIntervalSchema = z.number().int().min(50).max(5_000);
const PollMaxAttemptsSchema = z
  .number()
  .int()
  .min(1)
  .max(PRAVA_MAX_POLL_ATTEMPTS);

const ResponseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^resp_[A-Za-z0-9_-]+$/);

const SessionTokenSchema = z
  .string()
  .min(8)
  .max(4_096)
  .regex(/^[A-Za-z0-9._~-]+$/);

const CreateSessionResponseWireSchema = z
  .object({
    session_id: PravaSessionIdSchema,
    session_token: SessionTokenSchema,
    iframe_url: z.string().min(1).max(8_192),
    order_id: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    expires_at: z.iso.datetime(),
  })
  .strict();

const PollOptionsSchema = z
  .object({
    intervalMs: PollIntervalSchema.optional(),
    maxAttempts: PollMaxAttemptsSchema.optional(),
  })
  .strict();

const ReportStatusResponseStatusSchema = z.enum([
  "APPROVED",
  "DECLINED",
]);

type ParsedClientConfiguration = Readonly<{
  baseOrigin: string;
  environment: PravaEnvironment;
  secretKey: string;
  userIdSigningSecret: string;
  merchant: PravaMerchant;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollMaxAttempts: number;
}>;

type ParsedClientDependencies = Readonly<{
  fetch: FetchImplementation;
  now: () => number;
  randomUUID: () => string;
  sleep: Sleep;
  setTimer: SetTimer;
  clearTimer: ClearTimer;
}>;

function safeResponseId(response: Response): string | undefined {
  const parsed = ResponseIdSchema.safeParse(
    response.headers.get("X-Response-ID"),
  );

  return parsed.success ? parsed.data : undefined;
}

function defaultSetTimer(
  callback: () => void,
  milliseconds: number,
): ReturnType<typeof setTimeout> {
  return setTimeout(callback, milliseconds);
}

function defaultClearTimer(handle: TimerHandle): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function createDefaultSleep(
  setTimer: SetTimer,
  clearTimer: ClearTimer,
): Sleep {
  return (milliseconds, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }

      const timer = setTimer(resolve, milliseconds);
      const abort = () => {
        clearTimer(timer);
        reject(new Error("Aborted"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
}

function parseConfiguration(
  configuration: PravaClientConfiguration,
): ParsedClientConfiguration {
  try {
    const environment = resolvePravaEnvironment(configuration.baseUrl);
    const key = SecretKeySchema.safeParse(configuration.secretKey);
    const signingSecret = SigningSecretSchema.safeParse(
      configuration.userIdSigningSecret,
    );
    const merchant = PravaMerchantSchema.safeParse(
      configuration.merchant,
    );
    const requestTimeout = RequestTimeoutSchema.safeParse(
      configuration.requestTimeoutMs ??
        PRAVA_DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const pollInterval = PollIntervalSchema.safeParse(
      configuration.pollIntervalMs ?? PRAVA_DEFAULT_POLL_INTERVAL_MS,
    );
    const pollMaxAttempts = PollMaxAttemptsSchema.safeParse(
      configuration.pollMaxAttempts ??
        PRAVA_DEFAULT_POLL_MAX_ATTEMPTS,
    );
    const keyMatchesEnvironment =
      key.success &&
      ((environment === "sandbox" &&
        key.data.startsWith("sk_test_")) ||
        (environment === "production" &&
          key.data.startsWith("sk_live_")));

    if (
      !key.success ||
      !signingSecret.success ||
      !merchant.success ||
      !requestTimeout.success ||
      !pollInterval.success ||
      !pollMaxAttempts.success ||
      !keyMatchesEnvironment
    ) {
      throw new Error("Invalid configuration");
    }

    return {
      baseOrigin:
        environment === "sandbox"
          ? "https://sandbox.api.prava.space"
          : "https://api.prava.space",
      environment,
      secretKey: key.data,
      userIdSigningSecret: signingSecret.data,
      merchant: merchant.data,
      requestTimeoutMs: requestTimeout.data,
      pollIntervalMs: pollInterval.data,
      pollMaxAttempts: pollMaxAttempts.data,
    };
  } catch {
    throw new PravaClientError(
      "INVALID_CONFIGURATION",
      "configuration",
    );
  }
}

function parseDependencies(
  dependencies: PravaClientDependencies,
): ParsedClientDependencies {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const uuid = dependencies.randomUUID ?? randomUUID;
  const setTimer = dependencies.setTimer ?? defaultSetTimer;
  const clearTimer = dependencies.clearTimer ?? defaultClearTimer;
  const sleep =
    dependencies.sleep ?? createDefaultSleep(setTimer, clearTimer);

  if (
    typeof fetchImplementation !== "function" ||
    typeof now !== "function" ||
    typeof uuid !== "function" ||
    typeof setTimer !== "function" ||
    typeof clearTimer !== "function" ||
    typeof sleep !== "function"
  ) {
    throw new PravaClientError(
      "INVALID_CONFIGURATION",
      "configuration",
    );
  }

  return {
    fetch: fetchImplementation,
    now,
    randomUUID: uuid,
    setTimer,
    clearTimer,
    sleep,
  };
}

async function readBoundedJson(
  response: Response,
  operation: PravaClientOperation,
  responseId: string | undefined,
  signal: AbortSignal,
): Promise<unknown> {
  const contentType = response.headers.get("Content-Type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = response.headers.get("Content-Length");
  const parsedLength =
    contentLength === null ? null : Number(contentLength);

  if (
    mediaType !== "application/json" ||
    (parsedLength !== null &&
      (!Number.isSafeInteger(parsedLength) ||
        parsedLength < 0 ||
        parsedLength > PRAVA_MAX_RESPONSE_BYTES))
  ) {
    throw new PravaClientError("INVALID_RESPONSE", operation, {
      responseId,
    });
  }

  if (response.body === null) {
    throw new PravaClientError("INVALID_RESPONSE", operation, {
      responseId,
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          let settled = false;
          const abort = () => {
            if (settled) {
              return;
            }

            settled = true;
            void reader.cancel().catch(() => undefined);
            reject(new Error("Response body read aborted."));
          };

          if (signal.aborted) {
            abort();
            return;
          }

          signal.addEventListener("abort", abort, { once: true });
          void reader.read().then(
            (result) => {
              if (settled) {
                return;
              }

              settled = true;
              signal.removeEventListener("abort", abort);
              resolve(result);
            },
            (error: unknown) => {
              if (settled) {
                return;
              }

              settled = true;
              signal.removeEventListener("abort", abort);
              reject(error);
            },
          );
        },
      );

      if (chunk.done) {
        break;
      }

      totalBytes += chunk.value.byteLength;

      if (totalBytes > PRAVA_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new PravaClientError("INVALID_RESPONSE", operation, {
          responseId,
        });
      }

      chunks.push(chunk.value);
    }
  } catch (error) {
    if (signal.aborted || error instanceof PravaClientError) {
      throw error;
    }

    throw new PravaClientError("INVALID_RESPONSE", operation, {
      responseId,
    });
  } finally {
    if (!signal.aborted) {
      reader.releaseLock();
    }
  }

  if (totalBytes === 0) {
    throw new PravaClientError("INVALID_RESPONSE", operation, {
      responseId,
    });
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    return JSON.parse(body) as unknown;
  } catch {
    throw new PravaClientError("INVALID_RESPONSE", operation, {
      responseId,
    });
  }
}

function httpFailureIsRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function createPravaClient(
  configuration: PravaClientConfiguration,
  dependencies: PravaClientDependencies = {},
): PravaClient {
  const config = parseConfiguration(configuration);
  const runtime = parseDependencies(dependencies);

  async function requestJson(
    operation: Exclude<PravaClientOperation, "configuration" | "poll_payment_result">,
    path: string,
    method: "GET" | "POST",
    expectedStatus: 200 | 201,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) {
      throw new PravaClientError("REQUEST_ABORTED", operation);
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    const timeout = runtime.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, config.requestTimeoutMs);
    signal?.addEventListener("abort", abortFromCaller, { once: true });

    let response: Response | undefined;

    try {
      response = await runtime.fetch(`${config.baseOrigin}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.secretKey}`,
          ...(method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal,
      });
      const responseId = safeResponseId(response);

      if (response.status !== expectedStatus) {
        throw new PravaClientError("HTTP_ERROR", operation, {
          status: response.status,
          responseId,
          retryable: httpFailureIsRetryable(response.status),
        });
      }

      return await readBoundedJson(
        response,
        operation,
        responseId,
        controller.signal,
      );
    } catch (error) {
      if (timedOut) {
        throw new PravaClientError("REQUEST_TIMEOUT", operation, {
          retryable: true,
        });
      }

      if (signal?.aborted) {
        throw new PravaClientError("REQUEST_ABORTED", operation);
      }

      if (error instanceof PravaClientError) {
        throw error;
      }

      if (response !== undefined) {
        throw new PravaClientError("INVALID_RESPONSE", operation, {
          responseId: safeResponseId(response),
        });
      }

      throw new PravaClientError("NETWORK_ERROR", operation, {
        retryable: true,
      });
    } finally {
      runtime.clearTimer(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async function createSession(
    input: PravaCreateSessionInput,
    signal?: AbortSignal,
  ): Promise<PravaCreatedSession> {
    const parsedInput = PravaCreateSessionInputSchema.safeParse(input);

    if (!parsedInput.success) {
      throw new PravaClientError("INVALID_INPUT", "create_session");
    }

    let externalOrderReference: string;
    let userId: string;
    let normalizedEmail: string;

    try {
      const uuid = runtime.randomUUID();

      if (!z.string().uuid().safeParse(uuid).success) {
        throw new Error("Invalid UUID");
      }

      externalOrderReference = `FITORA-${uuid.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
      normalizedEmail = normalizePravaUserEmail(parsedInput.data.email);
      userId = derivePravaUserId(
        normalizedEmail,
        config.userIdSigningSecret,
      );
    } catch {
      throw new PravaClientError("INVALID_INPUT", "create_session");
    }

    let requestBody: PravaCreateSessionRequest;

    try {
      requestBody = buildPravaCreateSessionRequest({
        order: parsedInput.data.order,
        normalizedEmail,
        userId,
        callbackUrl: parsedInput.data.callbackUrl,
        merchant: config.merchant,
        externalOrderReference,
      });
    } catch {
      throw new PravaClientError("INVALID_INPUT", "create_session");
    }

    const responseBody = await requestJson(
      "create_session",
      "/v1/sessions",
      "POST",
      201,
      requestBody,
      signal,
    );
    const wire = CreateSessionResponseWireSchema.safeParse(responseBody);

    if (!wire.success) {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "create_session",
      );
    }

    let hostedUrl: string;
    const now = runtime.now();
    const expiresAtMilliseconds = Date.parse(wire.data.expires_at);

    try {
      hostedUrl = buildPravaHostedCheckoutUrl(
        wire.data.iframe_url,
        wire.data.session_token,
        config.environment,
      );
    } catch {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "create_session",
      );
    }

    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isFinite(expiresAtMilliseconds) ||
      expiresAtMilliseconds <= now ||
      expiresAtMilliseconds > now + 20 * 60 * 1_000
    ) {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "create_session",
      );
    }

    const created = PravaCreatedSessionSchema.safeParse({
      sessionId: wire.data.session_id,
      hostedUrl,
      orderId: wire.data.order_id,
      expiresAt: wire.data.expires_at,
    });

    if (!created.success) {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "create_session",
      );
    }

    return created.data;
  }

  async function getPaymentResult(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<PravaPaymentResult> {
    const session = PravaSessionIdSchema.safeParse(sessionId);

    if (!session.success) {
      throw new PravaClientError(
        "INVALID_INPUT",
        "get_payment_result",
      );
    }

    const responseBody = await requestJson(
      "get_payment_result",
      `/v1/sessions/${encodeURIComponent(session.data)}/payment-result`,
      "GET",
      200,
      undefined,
      signal,
    );

    let result: PravaPaymentResult;

    try {
      result = parsePravaPaymentResult(responseBody);
    } catch {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "get_payment_result",
      );
    }

    if (result.sessionId !== session.data) {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "get_payment_result",
      );
    }

    return result;
  }

  async function reportStatus(
    sessionId: string,
    input: PravaReportStatusInput,
    signal?: AbortSignal,
  ): Promise<PravaReportStatusResult> {
    const session = PravaSessionIdSchema.safeParse(sessionId);
    let requestBody: PravaReportStatusRequest;

    try {
      requestBody = buildPravaReportStatusRequest(input);
    } catch {
      throw new PravaClientError("INVALID_INPUT", "report_status");
    }

    if (!session.success) {
      throw new PravaClientError("INVALID_INPUT", "report_status");
    }

    const responseBody = await requestJson(
      "report_status",
      `/v1/sessions/${encodeURIComponent(session.data)}/report-status`,
      "POST",
      200,
      requestBody,
      signal,
    );

    let result: PravaReportStatusResult;

    try {
      result = parsePravaReportStatusResult(responseBody);
    } catch {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "report_status",
      );
    }

    if (
      result.transactionReferenceId !== requestBody.txn_ref_id ||
      (result.transactionStatus !== undefined &&
        !ReportStatusResponseStatusSchema.safeParse(
          result.transactionStatus,
        ).success) ||
      (result.transactionStatus !== undefined &&
        result.transactionStatus !== requestBody.txn_status)
    ) {
      throw new PravaClientError(
        "INVALID_RESPONSE",
        "report_status",
      );
    }

    return result;
  }

  async function pollPaymentResult(
    sessionId: string,
    options: PravaPollPaymentResultOptions = {},
  ): Promise<PravaPaymentResult> {
    const parsedOptions = PollOptionsSchema.safeParse({
      intervalMs: options.intervalMs,
      maxAttempts: options.maxAttempts,
    });

    if (!parsedOptions.success) {
      throw new PravaClientError(
        "INVALID_INPUT",
        "poll_payment_result",
      );
    }

    const intervalMs =
      parsedOptions.data.intervalMs ?? config.pollIntervalMs;
    const maxAttempts =
      parsedOptions.data.maxAttempts ?? config.pollMaxAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await getPaymentResult(sessionId, options.signal);

      if (result.status !== "pending") {
        return result;
      }

      if (attempt < maxAttempts) {
        try {
          await runtime.sleep(intervalMs, options.signal);
        } catch {
          if (options.signal?.aborted) {
            throw new PravaClientError(
              "REQUEST_ABORTED",
              "poll_payment_result",
            );
          }

          throw new PravaClientError(
            "NETWORK_ERROR",
            "poll_payment_result",
            { retryable: true },
          );
        }
      }
    }

    throw new PravaClientError(
      "POLL_EXHAUSTED",
      "poll_payment_result",
      { retryable: true },
    );
  }

  return Object.freeze({
    createSession,
    getPaymentResult,
    pollPaymentResult,
    reportStatus,
  });
}
