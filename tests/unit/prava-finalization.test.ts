import { describe, expect, it, vi } from "vitest";

import {
  finalizePravaCheckout,
  finalizePravaCheckoutOnce,
} from "@/lib/checkout/prava-finalization";
import {
  issuePravaProgressToken,
  verifyPravaProgressToken,
} from "@/lib/checkout/prava-progress";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  issueCheckoutToken,
  verifyCheckoutToken,
} from "@/lib/checkout/token";
import {
  issuePaymentSessionToken,
  verifyPaymentSessionToken,
} from "@/lib/checkout/workflow";
import type { PravaDemoMerchantAdapter } from "@/lib/merchant/prava-demo-merchant";
import {
  PravaClientError,
  formatPravaAmount,
  type PravaClient,
  type PravaMerchant,
  type PravaPaymentResult,
} from "@/lib/payments/prava";

const SIGNING_SECRET =
  "prava-finalization-test-signing-secret-123456789";
const SESSION_ID = "session_test_001";
const SESSION_ATTEMPT_ID =
  "f0000000-0000-4000-8000-00000000000f";
const TRANSACTION_REFERENCE = "line_test_001";
const FAKE_TOKEN = "TEST_ONLY_ONE_TIME_PAYMENT_VALUE";
const FAKE_CVV = "999";
const MERCHANT_PROFILE = {
  name: "Fitora Demo Merchant",
  url: "https://merchant.fitora.example",
  countryCode: "US",
} as const satisfies PravaMerchant;

function orderFixture(): VerifiedOrder {
  const result = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!result.ok) {
    throw new Error("Expected a canonical finalization fixture.");
  }

  return result.order;
}

function providerResult(
  status: "pending" | "completed" | "failed",
): PravaPaymentResult {
  return {
    status,
    sessionId: SESSION_ID,
    orderId: "order_test_001",
  };
}

function awaitingResult(
  order = orderFixture(),
): Extract<PravaPaymentResult, { status: "awaiting_result" }> {
  return {
    status: "awaiting_result",
    sessionId: SESSION_ID,
    orderId: "order_test_001",
    transactions: [
      {
        transactionId: "transaction_test_001",
        lineItems: [
          {
            transactionReferenceId: TRANSACTION_REFERENCE,
            merchantName: MERCHANT_PROFILE.name,
            merchantUrl: MERCHANT_PROFILE.url,
            totalAmount: formatPravaAmount(order.totalCents),
            credential: {
              token: FAKE_TOKEN,
              dynamicCvv: FAKE_CVV,
              expiryMonth: "12",
              expiryYear: "2099",
            },
            products: order.items.map((item, index) => ({
              productReferenceId: `provider_product_${index + 1}`,
              externalProductId: item.productId,
              name: item.name,
              unitPrice: formatPravaAmount(item.unitPriceCents),
              quantity: item.quantity,
            })),
          },
        ],
      },
    ],
  };
}

type ClientDouble = Pick<
  PravaClient,
  "getPaymentResult" | "pollPaymentResult" | "reportStatus"
>;

function clientDouble(): ClientDouble {
  return {
    getPaymentResult: vi.fn(),
    pollPaymentResult: vi.fn(),
    reportStatus: vi.fn(),
  };
}

function approvedMerchant(): PravaDemoMerchantAdapter {
  return {
    checkout: vi.fn().mockResolvedValue({
      status: "approved",
      orderReference: "FITORA-PRAVA-ABCDEF0123456789",
      reportStatus: "APPROVED",
      authorizationCode: "ABC123",
      responseCode: "00",
    }),
  };
}

function existingProgressFixture(
  expectedOutcome: Parameters<
    typeof issuePravaProgressToken
  >[0]["expectedOutcome"] = {
    status: "approved",
    orderReference: "FITORA-PRAVA-ABCDEF0123456789",
  },
) {
  const order = orderFixture();
  const nowEpochSeconds = Math.floor(Date.now() / 1_000);
  const reviewToken = issueCheckoutToken(order, SIGNING_SECRET, {
    nowEpochSeconds,
    ttlSeconds: 15 * 60,
  });
  const review = verifyCheckoutToken(reviewToken, SIGNING_SECRET, {
    nowEpochSeconds,
  });

  if (!review.ok) {
    throw new Error("Expected valid review claims.");
  }

  const sessionToken = issuePaymentSessionToken(
    {
      attemptId: SESSION_ATTEMPT_ID,
      checkoutClaims: review.claims,
      order: orderFixture(),
      session: {
        provider: "prava",
        sessionId: SESSION_ID,
        hostedUrl:
          "https://sandbox.collect.prava.space/?session_token=TEST_ONLY",
        expiresAt: new Date(
          (nowEpochSeconds + 10 * 60) * 1_000,
        ).toISOString(),
      },
    },
    SIGNING_SECRET,
    { nowEpochSeconds },
  );
  const session = verifyPaymentSessionToken(
    sessionToken,
    SIGNING_SECRET,
    { nowEpochSeconds },
  );

  if (!session.ok) {
    throw new Error("Expected valid session claims.");
  }

  const progressToken = issuePravaProgressToken(
    {
      checkoutClaims: review.claims,
      sessionClaims: session.claims,
      order,
      transactionReference: TRANSACTION_REFERENCE,
      expectedOutcome,
    },
    SIGNING_SECRET,
    { nowEpochSeconds },
  );
  const progress = verifyPravaProgressToken(
    progressToken,
    SIGNING_SECRET,
    { nowEpochSeconds },
  );

  if (!progress.ok) {
    throw new Error("Expected valid progress claims.");
  }

  return progress.claims;
}

function baseInput(
  client: ClientDouble,
  merchant: PravaDemoMerchantAdapter = approvedMerchant(),
) {
  return {
    client,
    merchant,
    merchantProfile: MERCHANT_PROFILE,
    order: orderFixture(),
    sessionId: SESSION_ID,
    signingSecret: SIGNING_SECRET,
  } as const;
}

function expectNoCredentials(value: unknown): void {
  expect(JSON.stringify(value)).not.toMatch(
    new RegExp(`${FAKE_TOKEN}|${FAKE_CVV}|dynamicCvv|expiryMonth|expiryYear`),
  );
}

describe("Prava callback finalization", () => {
  it("coalesces concurrent callbacks for the same provider session", async () => {
    const client = clientDouble();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(client.pollPaymentResult).mockImplementation(async () => {
      await gate;
      return providerResult("completed");
    });
    const input = baseInput(client);

    const first = finalizePravaCheckoutOnce(input);
    const second = finalizePravaCheckoutOnce(input);

    expect(second).toBe(first);
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(client.pollPaymentResult).toHaveBeenCalledOnce();
  });

  it("returns provider-confirmed pending when successful polling remains pending", async () => {
    const client = clientDouble();
    vi.mocked(client.pollPaymentResult).mockRejectedValue(
      new PravaClientError("POLL_EXHAUSTED", "poll_payment_result", {
        retryable: true,
      }),
    );

    const result = await finalizePravaCheckout(baseInput(client));

    expect(result).toEqual({
      status: "pending",
      providerConfirmed: true,
    });
    expect(client.reportStatus).not.toHaveBeenCalled();
  });

  it("keeps retryable network uncertainty distinct from confirmed pending", async () => {
    const client = clientDouble();
    vi.mocked(client.pollPaymentResult).mockRejectedValue(
      new PravaClientError("NETWORK_ERROR", "poll_payment_result", {
        retryable: true,
      }),
    );

    const result = await finalizePravaCheckout(baseInput(client));

    expect(result).toEqual({
      status: "pending",
      providerConfirmed: false,
    });
    expect(client.reportStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["completed", "approved"],
    ["failed", "declined"],
  ] as const)("recovers an already %s provider session", async (providerStatus, expectedStatus) => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    vi.mocked(client.pollPaymentResult).mockResolvedValue(
      providerResult(providerStatus),
    );

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: {
        provider: "prava",
        sessionId: SESSION_ID,
        status: expectedStatus,
      },
    });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(client.reportStatus).not.toHaveBeenCalled();
  });

  it("executes one approved merchant checkout, reports it, and confirms completion", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(awaitingResult())
      .mockResolvedValueOnce(providerResult("completed"));
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: {
        status: "approved",
        orderReference: "FITORA-PRAVA-ABCDEF0123456789",
      },
    });
    expect(merchant.checkout).toHaveBeenCalledOnce();
    expect(client.reportStatus).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        transactionReferenceId: TRANSACTION_REFERENCE,
        status: "APPROVED",
        responseCode: "00",
      }),
      undefined,
    );
    expectNoCredentials(result);
  });

  it("retains progress when post-report polling confirms only a pending provider state", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(awaitingResult())
      .mockRejectedValueOnce(
        new PravaClientError(
          "POLL_EXHAUSTED",
          "poll_payment_result",
          { retryable: true },
        ),
      );
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toMatchObject({
      status: "pending",
      providerConfirmed: true,
      progress: {
        transactionReference: TRANSACTION_REFERENCE,
        expectedOutcome: { status: "approved" },
      },
    });
    expect(merchant.checkout).toHaveBeenCalledOnce();
    expectNoCredentials(result);
  });

  it("always reports a merchant exception as declined and confirms provider failure", async () => {
    const client = clientDouble();
    const merchant: PravaDemoMerchantAdapter = {
      checkout: vi.fn().mockRejectedValue(new Error("merchant unavailable")),
    };
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(awaitingResult())
      .mockResolvedValueOnce(providerResult("failed"));
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "DECLINED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: {
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      },
    });
    expect(client.reportStatus).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        status: "DECLINED",
        responseCode: "30",
      }),
      undefined,
    );
    expectNoCredentials(result);
  });

  it("returns safe retry progress when reporting cannot be confirmed", async () => {
    const client = clientDouble();
    vi.mocked(client.pollPaymentResult).mockResolvedValue(awaitingResult());
    vi.mocked(client.reportStatus).mockRejectedValue(
      new PravaClientError("NETWORK_ERROR", "report_status", {
        retryable: true,
      }),
    );
    vi.mocked(client.getPaymentResult).mockResolvedValue(awaitingResult());

    const result = await finalizePravaCheckout(baseInput(client));

    expect(result).toMatchObject({
      status: "reconciliation_required",
      progress: {
        transactionReference: TRANSACTION_REFERENCE,
        expectedOutcome: { status: "approved" },
      },
    });
    expectNoCredentials(result);
  });

  it("uses a bound progress marker to retry its recorded outcome even when merchant execution is forbidden", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(awaitingResult())
      .mockResolvedValueOnce(providerResult("completed"));
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout({
      ...baseInput(client, merchant),
      existingProgress: existingProgressFixture(),
      merchantExecutionAllowed: false,
    });

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: { status: "approved" },
    });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(client.reportStatus).toHaveBeenCalledOnce();
    expectNoCredentials(result);
  });

  it("declines an unambiguous canonical mismatch without executing the merchant", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    const mismatched = awaitingResult();
    mismatched.transactions[0].lineItems[0].totalAmount = "0.01";
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(providerResult("failed"));
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "DECLINED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: {
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      },
    });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(client.reportStatus).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        transactionReferenceId: TRANSACTION_REFERENCE,
        status: "DECLINED",
        responseCode: "05",
      }),
      undefined,
    );
    expectNoCredentials(result);
  });

  it("uses reconciliation only when multiple provider transactions are ambiguous", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    const ambiguous = awaitingResult();
    ambiguous.transactions.push(ambiguous.transactions[0]);
    vi.mocked(client.pollPaymentResult).mockResolvedValue(ambiguous);

    const result = await finalizePravaCheckout(
      baseInput(client, merchant),
    );

    expect(result).toEqual({ status: "reconciliation_required" });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(client.reportStatus).not.toHaveBeenCalled();
    expectNoCredentials(result);
  });

  it("declines valid provider context when catalogue drift forbids merchant execution", async () => {
    const client = clientDouble();
    const merchant = approvedMerchant();
    vi.mocked(client.pollPaymentResult)
      .mockResolvedValueOnce(awaitingResult())
      .mockResolvedValueOnce(providerResult("failed"));
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "DECLINED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout({
      ...baseInput(client, merchant),
      merchantExecutionAllowed: false,
    });

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: { status: "declined" },
    });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(client.reportStatus).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        transactionReferenceId: TRANSACTION_REFERENCE,
        status: "DECLINED",
      }),
      undefined,
    );
    expectNoCredentials(result);
  });

  it("resumes a declined mismatch report without executing the merchant on retry", async () => {
    const firstClient = clientDouble();
    const merchant = approvedMerchant();
    const mismatched = awaitingResult();
    mismatched.transactions[0].lineItems[0].totalAmount = "0.01";
    vi.mocked(firstClient.pollPaymentResult).mockResolvedValue(
      mismatched,
    );
    vi.mocked(firstClient.reportStatus).mockRejectedValue(
      new PravaClientError("NETWORK_ERROR", "report_status", {
        retryable: true,
      }),
    );
    vi.mocked(firstClient.getPaymentResult).mockResolvedValue(
      mismatched,
    );

    const firstResult = await finalizePravaCheckout(
      baseInput(firstClient, merchant),
    );

    expect(firstResult).toMatchObject({
      status: "reconciliation_required",
      progress: {
        transactionReference: TRANSACTION_REFERENCE,
        expectedOutcome: {
          status: "declined",
          reasonCode: "MERCHANT_DECLINED",
        },
      },
    });
    expectNoCredentials(firstResult);

    const retryClient = clientDouble();
    vi.mocked(retryClient.pollPaymentResult)
      .mockResolvedValueOnce(mismatched)
      .mockResolvedValueOnce(providerResult("failed"));
    vi.mocked(retryClient.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: TRANSACTION_REFERENCE,
      transactionStatus: "DECLINED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout({
      ...baseInput(retryClient, merchant),
      existingProgress: existingProgressFixture({
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      }),
    });

    expect(result).toMatchObject({
      status: "terminal",
      paymentResult: {
        status: "declined",
        reasonCode: "MERCHANT_DECLINED",
      },
    });
    expect(merchant.checkout).not.toHaveBeenCalled();
    expect(firstClient.reportStatus).toHaveBeenCalledOnce();
    expect(retryClient.reportStatus).toHaveBeenCalledOnce();
    expectNoCredentials(result);
  });

  it("does not accept a report confirmation for another transaction", async () => {
    const client = clientDouble();
    vi.mocked(client.pollPaymentResult).mockResolvedValue(awaitingResult());
    vi.mocked(client.reportStatus).mockResolvedValue({
      status: "confirmed",
      transactionReferenceId: "line_test_other",
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });

    const result = await finalizePravaCheckout(baseInput(client));

    expect(result).toMatchObject({
      status: "reconciliation_required",
      progress: { expectedOutcome: { status: "approved" } },
    });
    expectNoCredentials(result);
  });
});
