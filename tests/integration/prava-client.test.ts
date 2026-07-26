import { describe, expect, it, vi } from "vitest";

import { verifyCheckoutOrder } from "@/lib/checkout/order";
import {
  PravaClientError,
  createPravaClient,
  formatPravaAmount,
  type PravaClientConfiguration,
  type PravaClientDependencies,
} from "@/lib/payments/prava";

const NOW = 2_000_000_000_000;
const API_SECRET = [
  "sk",
  "test",
  "fitora_contract_secret_123456",
].join("_");
const LEAKED_API_SECRET = ["sk", "test", "leaked"].join("_");
const SIGNING_SECRET =
  "fitora-prava-client-test-signing-secret";
const UUID = "11111111-1111-4111-8111-111111111111";

function order() {
  const verified = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!verified.ok) {
    throw new Error("The Prava client fixture order is invalid.");
  }

  return verified.order;
}

function configuration(
  overrides: Partial<PravaClientConfiguration> = {},
): PravaClientConfiguration {
  return {
    baseUrl: "https://sandbox.api.prava.space",
    secretKey: API_SECRET,
    userIdSigningSecret: SIGNING_SECRET,
    merchant: {
      name: "Fitora Demo Merchant",
      url: "https://fitora.example",
      countryCode: "US",
    },
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function stalledJsonResponse(
  onStall: () => void,
): Response {
  const prefix = new TextEncoder().encode(
    '{"session_id":"ses_fitora_123",',
  );
  let emittedPrefix = false;

  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!emittedPrefix) {
          emittedPrefix = true;
          controller.enqueue(prefix);
          return;
        }

        onStall();
        return new Promise<void>(() => undefined);
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function dependencies(
  fetchMock: ReturnType<typeof vi.fn>,
  overrides: Partial<PravaClientDependencies> = {},
): PravaClientDependencies {
  return {
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    randomUUID: () => UUID,
    ...overrides,
  };
}

function createdSessionWire() {
  return {
    session_id: "ses_fitora_123",
    session_token: "header.payload.signature",
    iframe_url:
      "https://sandbox.collect.prava.space/hosted?theme=fitora",
    order_id: "ord_fitora_123",
    expires_at: new Date(NOW + 15 * 60 * 1_000).toISOString(),
  };
}

function paymentResultWire(
  status: "pending" | "awaiting_result" | "completed" | "failed",
) {
  if (status !== "awaiting_result") {
    return {
      session_id: "ses_fitora_123",
      order_id: "ord_fitora_123",
      status,
      transactions: [],
    };
  }

  return {
    session_id: "ses_fitora_123",
    order_id: "ord_fitora_123",
    status,
    transactions: [
      {
        txn_id: "txn_fitora_123",
        status,
        line_items: [
          {
            txn_ref_id: "tli_fitora_123",
            merchant_name: "Fitora Demo Merchant",
            merchant_url: "https://fitora.example",
            total_amount: formatPravaAmount(order().totalCents),
            status,
            token: "TEST_ONLY_ONE_TIME_TOKEN",
            dynamic_cvv: "957",
            expiry_month: "12",
            expiry_year: "2028",
            products: [
              {
                product_ref_id: "prd_1",
                external_product_id: "top-01",
                name: order().items[0].name,
                unit_price: formatPravaAmount(
                  order().items[0].unitPriceCents,
                ),
                quantity: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

function fetchCall(
  fetchMock: ReturnType<typeof vi.fn>,
  index = 0,
): readonly [string, RequestInit] {
  const call = fetchMock.mock.calls[index] as unknown[] | undefined;

  if (
    !call ||
    typeof call[0] !== "string" ||
    typeof call[1] !== "object" ||
    call[1] === null
  ) {
    throw new Error("The Prava fetch fixture did not receive a request.");
  }

  return [call[0], call[1] as RequestInit];
}

describe("Prava REST client", () => {
  it("sends the exact create-session contract with Bearer auth and returns only the intended hosted URL token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(createdSessionWire(), 201, {
          "X-Response-ID": "resp_create_123",
        }),
      );
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );
    const created = await client.createSession({
      order: order(),
      email: "  Shopper@Example.COM ",
      callbackUrl: "https://fitora.example/checkout/callback",
    });
    const [url, init] = fetchCall(fetchMock);
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const hostedUrl = new URL(created.hostedUrl);

    expect(url).toBe("https://sandbox.api.prava.space/v1/sessions");
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
    });
    expect(headers.get("Authorization")).toBe(`Bearer ${API_SECRET}`);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(body).toMatchObject({
      user_email: "shopper@example.com",
      total_amount: formatPravaAmount(order().totalCents),
      currency: "USD",
      external_order_ref: `FITORA-${UUID}`,
      integration_type: "full_checkout",
      callback_url: "https://fitora.example/checkout/callback",
      purchase_context: [
        {
          merchant_details: {
            name: "Fitora Demo Merchant",
            url: "https://fitora.example",
            country_code_iso2: "US",
          },
          product_details: expect.arrayContaining([
            expect.objectContaining({
              product_id: "top-01",
              quantity: 1,
            }),
          ]),
        },
      ],
    });
    expect(String(body.user_id)).toMatch(
      /^fitora_[A-Za-z0-9_-]{43}$/,
    );
    expect(String(body.user_id)).not.toContain("shopper");
    expect(created).toMatchObject({
      sessionId: "ses_fitora_123",
      orderId: "ord_fitora_123",
      expiresAt: createdSessionWire().expires_at,
    });
    expect(Object.keys(created).sort()).toEqual(
      ["expiresAt", "hostedUrl", "orderId", "sessionId"].sort(),
    );
    expect(hostedUrl.searchParams.getAll("session_token")).toEqual([
      "header.payload.signature",
    ]);
  });

  it("gets transient credentials and reports an approved result with exact paths and contracts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(paymentResultWire("awaiting_result")))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "confirmed",
          txn_ref_id: "tli_fitora_123",
          txn_status: "APPROVED",
          visa_confirmation: "SUCCESS",
        }),
      );
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );
    const payment = await client.getPaymentResult(
      "ses_fitora_123",
    );
    const reported = await client.reportStatus("ses_fitora_123", {
      transactionReferenceId: "tli_fitora_123",
      status: "APPROVED",
      responseCode: "00",
      amountPaidCents: order().totalCents,
    });
    const [getUrl, getInit] = fetchCall(fetchMock, 0);
    const [reportUrl, reportInit] = fetchCall(fetchMock, 1);

    expect(getUrl).toBe(
      "https://sandbox.api.prava.space/v1/sessions/ses_fitora_123/payment-result",
    );
    expect(getInit.method).toBe("GET");
    expect(new Headers(getInit.headers).get("Authorization")).toBe(
      `Bearer ${API_SECRET}`,
    );
    expect(payment).toMatchObject({
      status: "awaiting_result",
      transactions: [
        {
          lineItems: [
            {
              transactionReferenceId: "tli_fitora_123",
              credential: {
                token: "TEST_ONLY_ONE_TIME_TOKEN",
                dynamicCvv: "957",
                expiryMonth: "12",
                expiryYear: "2028",
              },
            },
          ],
        },
      ],
    });
    expect(reportUrl).toBe(
      "https://sandbox.api.prava.space/v1/sessions/ses_fitora_123/report-status",
    );
    expect(JSON.parse(String(reportInit.body))).toEqual({
      txn_ref_id: "tli_fitora_123",
      txn_status: "APPROVED",
      response_code: "00",
      amount_paid: formatPravaAmount(order().totalCents),
    });
    expect(reported).toEqual({
      status: "confirmed",
      transactionReferenceId: "tli_fitora_123",
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });
  });

  it("polls only within configured bounds and stops as soon as credentials are available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(paymentResultWire("pending")))
      .mockResolvedValueOnce(
        jsonResponse(paymentResultWire("awaiting_result")),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock, {
        sleep: sleep as (milliseconds: number) => Promise<void>,
      }),
    );

    const result = await client.pollPaymentResult("ses_fitora_123", {
      intervalMs: 100,
      maxAttempts: 3,
    });

    expect(result.status).toBe("awaiting_result");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(100, undefined);
  });

  it("fails closed after the bounded polling attempts", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(paymentResultWire("pending"))),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock, {
        sleep: sleep as (milliseconds: number) => Promise<void>,
      }),
    );

    await expect(
      client.pollPaymentResult("ses_fitora_123", {
        intervalMs: 50,
        maxAttempts: 2,
      }),
    ).rejects.toMatchObject({
      code: "POLL_EXHAUSTED",
      operation: "poll_payment_result",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("returns sanitized HTTP errors and accepts only a safe X-Response-ID", async () => {
    const sensitiveBody = {
      error: {
        message: `${LEAKED_API_SECRET} header.payload.signature TEST_ONLY_ONE_TIME_TOKEN 957 12/2028 shopper@example.com`,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(sensitiveBody, 401, {
          "X-Response-ID": "resp_safe_123",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(sensitiveBody, 500, {
          "X-Response-ID": "TEST_ONLY_ONE_TIME_TOKEN",
        }),
      );
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );

    const first = await client
      .getPaymentResult("ses_fitora_123")
      .catch((error: unknown) => error);
    const second = await client
      .getPaymentResult("ses_fitora_123")
      .catch((error: unknown) => error);

    expect(first).toBeInstanceOf(PravaClientError);
    expect(first).toMatchObject({
      code: "HTTP_ERROR",
      status: 401,
      responseId: "resp_safe_123",
      retryable: false,
    });
    expect(second).toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
      retryable: true,
    });
    expect((second as PravaClientError).responseId).toBeUndefined();
    const serializedErrors = JSON.stringify({ first, second });

    expect(serializedErrors).not.toContain(LEAKED_API_SECRET);
    expect(serializedErrors).not.toMatch(
      /header\.payload|TEST_ONLY_ONE_TIME_TOKEN|shopper@example\.com|12\/2028/,
    );
  });

  it("rejects malformed success bodies without leaking them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          ...createdSessionWire(),
          session_id: "bad/session",
          leaked: "shopper@example.com TEST_ONLY_ONE_TIME_TOKEN",
        },
        201,
        { "X-Response-ID": "resp_invalid_123" },
      ),
    );
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );
    const error = await client
      .createSession({
        order: order(),
        email: "shopper@example.com",
        callbackUrl: "https://fitora.example/checkout/callback",
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "INVALID_RESPONSE",
      operation: "create_session",
    });
    expect(JSON.stringify(error)).not.toMatch(
      /shopper@example\.com|TEST_ONLY_ONE_TIME_TOKEN|bad\/session/,
    );
  });

  it("enforces timeout and caller abort without exposing request state", async () => {
    const hangingFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () =>
            reject(new DOMException("Aborted", "AbortError"));

          if (init?.signal?.aborted) {
            rejectAbort();
          } else {
            init?.signal?.addEventListener("abort", rejectAbort, {
              once: true,
            });
          }
        }),
    );
    const timeoutClient = createPravaClient(
      configuration({ requestTimeoutMs: 100 }),
      dependencies(hangingFetch, {
        setTimer: (callback) => {
          callback();
          return 1;
        },
        clearTimer: () => undefined,
      }),
    );

    await expect(
      timeoutClient.getPaymentResult("ses_fitora_123"),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });

    const abortedFetch = vi.fn();
    const abortClient = createPravaClient(
      configuration(),
      dependencies(abortedFetch),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      abortClient.getPaymentResult(
        "ses_fitora_123",
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(abortedFetch).not.toHaveBeenCalled();
  });

  it("keeps the request timeout active while a response body stalls after headers", async () => {
    let triggerTimeout: (() => void) | undefined;
    let signalBodyStalled: (() => void) | undefined;
    const bodyStalled = new Promise<void>((resolve) => {
      signalBodyStalled = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue(
      stalledJsonResponse(() => signalBodyStalled?.()),
    );
    const clearTimer = vi.fn();
    const client = createPravaClient(
      configuration({ requestTimeoutMs: 100 }),
      dependencies(fetchMock, {
        setTimer: (callback) => {
          triggerTimeout = callback;
          return 1;
        },
        clearTimer,
      }),
    );
    const result = client.getPaymentResult("ses_fitora_123");

    await bodyStalled;
    expect(clearTimer).not.toHaveBeenCalled();
    triggerTimeout?.();

    await expect(result).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      operation: "get_payment_result",
      retryable: true,
    });
    expect(clearTimer).toHaveBeenCalledWith(1);
  });

  it("honours caller abort while consuming a response body", async () => {
    let signalBodyStalled: (() => void) | undefined;
    const bodyStalled = new Promise<void>((resolve) => {
      signalBodyStalled = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue(
      stalledJsonResponse(() => signalBodyStalled?.()),
    );
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );
    const controller = new AbortController();
    const result = client.getPaymentResult(
      "ses_fitora_123",
      controller.signal,
    );

    await bodyStalled;
    controller.abort();

    await expect(result).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
      operation: "get_payment_result",
      retryable: false,
    });
  });

  it("rejects a chunked response that exceeds the hard byte limit without Content-Length", async () => {
    let chunksEmitted = 0;
    const oversizedResponse = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          chunksEmitted += 1;
          controller.enqueue(new Uint8Array(64 * 1_024));

          if (chunksEmitted === 5) {
            controller.close();
          }
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    const fetchMock = vi.fn().mockResolvedValue(oversizedResponse);
    const client = createPravaClient(
      configuration(),
      dependencies(fetchMock),
    );

    expect(oversizedResponse.headers.get("Content-Length")).toBeNull();
    await expect(
      client.getPaymentResult("ses_fitora_123"),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      operation: "get_payment_result",
    });
    expect(chunksEmitted).toBe(5);
  });

  it("rejects non-official origins and environment-key mismatches", () => {
    expect(() =>
      createPravaClient(
        configuration({
          baseUrl: "https://sandbox.api.prava.space.attacker.example",
        }),
      ),
    ).toThrow(PravaClientError);
    expect(() =>
      createPravaClient(
        configuration({
          baseUrl: "https://api.prava.space",
          secretKey: API_SECRET,
        }),
      ),
    ).toThrow(PravaClientError);
  });
});
