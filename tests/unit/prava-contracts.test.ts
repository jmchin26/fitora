import { describe, expect, it } from "vitest";

import { verifyCheckoutOrder } from "@/lib/checkout/order";
import {
  PravaCreateSessionRequestSchema,
  PravaPaymentResultSchema,
  buildPravaCreateSessionRequest,
  buildPravaHostedCheckoutUrl,
  buildPravaReportStatusRequest,
  derivePravaUserId,
  formatPravaAmount,
  normalizePravaUserEmail,
  parsePravaPaymentResult,
  parsePravaReportStatusResult,
} from "@/lib/payments/prava";

const SIGNING_SECRET =
  "fitora-prava-contract-test-signing-secret";

function order() {
  const verified = verifyCheckoutOrder({
    outfit: {
      top: { productId: "top-01", selectedSize: "M" },
      bottom: { productId: "bottom-01", selectedSize: "M" },
      shoes: { productId: "shoes-01", selectedSize: "42" },
    },
  });

  if (!verified.ok) {
    throw new Error("The Prava contract fixture order is invalid.");
  }

  return verified.order;
}

function awaitingResultWire() {
  return {
    session_id: "ses_fitora_123",
    order_id: "ord_fitora_123",
    status: "awaiting_result",
    transactions: [
      {
        txn_id: "txn_fitora_123",
        status: "awaiting_result",
        line_items: [
          {
            txn_ref_id: "tli_fitora_123",
            merchant_name: "Fitora Demo Merchant",
            merchant_url: "https://fitora.example",
            total_amount: formatPravaAmount(order().totalCents),
            status: "awaiting_result",
            token: "TEST_ONLY_ONE_TIME_TOKEN",
            dynamic_cvv: "957",
            expiry_month: "12",
            expiry_year: "2028",
            products: order().items.map((item, index) => ({
              product_ref_id: `prd_${index + 1}`,
              external_product_id: item.productId,
              name: item.name,
              unit_price: formatPravaAmount(item.unitPriceCents),
              quantity: item.quantity,
            })),
          },
        ],
      },
    ],
  };
}

describe("Prava create-session contracts", () => {
  it("derives one stable privacy-preserving user ID from normalized email", () => {
    const first = derivePravaUserId(
      "  Shopper@Example.COM ",
      SIGNING_SECRET,
    );
    const second = derivePravaUserId(
      "shopper@example.com",
      SIGNING_SECRET,
    );

    expect(normalizePravaUserEmail("  Shopper@Example.COM ")).toBe(
      "shopper@example.com",
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^fitora_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain("shopper");
    expect(
      derivePravaUserId(
        "other@example.com",
        SIGNING_SECRET,
      ),
    ).not.toBe(first);
    expect(() => derivePravaUserId("not-email", SIGNING_SECRET)).toThrow(
      "The Prava customer email is invalid.",
    );
  });

  it("builds one full-checkout merchant context from the canonical order", () => {
    const verifiedOrder = order();
    const userId = derivePravaUserId(
      "shopper@example.com",
      SIGNING_SECRET,
    );
    const request = buildPravaCreateSessionRequest({
      order: verifiedOrder,
      normalizedEmail: "shopper@example.com",
      userId,
      callbackUrl: "https://fitora.example/checkout/callback",
      merchant: {
        name: "Fitora Demo Merchant",
        url: "https://fitora.example",
        countryCode: "US",
      },
      externalOrderReference:
        "FITORA-11111111-1111-4111-8111-111111111111",
    });

    expect(request).toEqual({
      user_id: userId,
      user_email: "shopper@example.com",
      total_amount: formatPravaAmount(verifiedOrder.totalCents),
      currency: "USD",
      purchase_context: [
        {
          merchant_details: {
            name: "Fitora Demo Merchant",
            url: "https://fitora.example",
            country_code_iso2: "US",
          },
          product_details: verifiedOrder.items.map((item) => ({
            description: item.name,
            unit_price: formatPravaAmount(item.unitPriceCents),
            quantity: 1,
            product_id: item.productId,
          })),
          effective_until_minutes: 15,
        },
      ],
      external_order_ref:
        "FITORA-11111111-1111-4111-8111-111111111111",
      description: "Fitora complete outfit",
      integration_type: "full_checkout",
      callback_url: "https://fitora.example/checkout/callback",
    });
    expect(PravaCreateSessionRequestSchema.safeParse(request).success).toBe(
      true,
    );
  });

  it("uses exact decimal strings and rejects an insecure callback or changed total", () => {
    expect(formatPravaAmount(0)).toBe("0.00");
    expect(formatPravaAmount(1)).toBe("0.01");
    expect(formatPravaAmount(12_345)).toBe("123.45");
    expect(() => formatPravaAmount(1.5)).toThrow();

    const valid = buildPravaCreateSessionRequest({
      order: order(),
      normalizedEmail: "shopper@example.com",
      userId: derivePravaUserId(
        "shopper@example.com",
        SIGNING_SECRET,
      ),
      callbackUrl: "https://fitora.example/checkout/callback",
      merchant: {
        name: "Fitora Demo Merchant",
        url: "https://fitora.example",
        countryCode: "US",
      },
      externalOrderReference: "FITORA-ORDER-123",
    });

    expect(
      PravaCreateSessionRequestSchema.safeParse({
        ...valid,
        total_amount: "0.01",
      }).success,
    ).toBe(false);
    expect(() =>
      buildPravaCreateSessionRequest({
        order: order(),
        normalizedEmail: "shopper@example.com",
        userId: valid.user_id,
        callbackUrl: "http://fitora.example/checkout/callback",
        merchant: {
          name: "Fitora Demo Merchant",
          url: "https://fitora.example",
          countryCode: "US",
        },
        externalOrderReference: "FITORA-ORDER-123",
      }),
    ).toThrow("The Prava create-session input is invalid.");
  });
});

describe("Prava hosted URL and result contracts", () => {
  it("sets the exact session token once and rejects an untrusted hosted origin", () => {
    const hosted = buildPravaHostedCheckoutUrl(
      "https://sandbox.collect.prava.space/pay?theme=fitora&session_token=stale&session_token=duplicate",
      "eyJhbGciOiJIUzI1NiJ9.payload.signature",
      "sandbox",
    );
    const url = new URL(hosted);

    expect(url.origin).toBe("https://sandbox.collect.prava.space");
    expect(url.searchParams.getAll("session_token")).toEqual([
      "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    ]);
    expect(url.searchParams.get("theme")).toBe("fitora");
    expect(() =>
      buildPravaHostedCheckoutUrl(
        "https://sandbox.collect.prava.space.attacker.example/pay",
        "eyJhbGciOiJIUzI1NiJ9.payload.signature",
        "sandbox",
      ),
    ).toThrow("The Prava hosted checkout response is invalid.");
  });

  it.each(["pending", "completed", "failed"] as const)(
    "parses and sanitizes the %s status without credential-shaped state",
    (status) => {
      const raw = {
        ...awaitingResultWire(),
        status,
        transactions:
          status === "pending" ? [] : awaitingResultWire().transactions,
      };
      const parsed = parsePravaPaymentResult(raw);

      expect(parsed).toEqual({
        sessionId: "ses_fitora_123",
        orderId: "ord_fitora_123",
        status,
      });
      expect(JSON.stringify(parsed)).not.toMatch(
        /TEST_ONLY_ONE_TIME_TOKEN|dynamicCvv|expiryMonth|expiryYear/,
      );
      expect(PravaPaymentResultSchema.safeParse(parsed).success).toBe(true);
    },
  );

  it("exposes credentials only in a strict awaiting-result line-item branch", () => {
    const parsed = parsePravaPaymentResult(awaitingResultWire());

    expect(parsed).toMatchObject({
      status: "awaiting_result",
      transactions: [
        {
          transactionId: "txn_fitora_123",
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

    const missingCvv = structuredClone(awaitingResultWire());
    delete (
      missingCvv.transactions[0].line_items[0] as Partial<{
        dynamic_cvv: string;
      }>
    ).dynamic_cvv;

    expect(() => parsePravaPaymentResult(missingCvv)).toThrow(
      "The Prava payment-result contract is invalid.",
    );
    expect(() =>
      parsePravaPaymentResult({
        ...awaitingResultWire(),
        unexpected: "field",
      }),
    ).toThrow("The Prava payment-result contract is invalid.");
  });
});

describe("Prava report-status contracts", () => {
  it("maps approved and declined reports to the exact wire contract", () => {
    expect(
      buildPravaReportStatusRequest({
        transactionReferenceId: "tli_fitora_123",
        status: "APPROVED",
        transactionType: "PURCHASE",
        authorizationCode: "AUTH123",
        responseCode: "00",
        amountPaidCents: 13_800,
        productStatuses: [
          {
            productId: "top-01",
            productReferenceId: "prd_1",
            amountPaidCents: 4_900,
          },
        ],
      }),
    ).toEqual({
      txn_ref_id: "tli_fitora_123",
      txn_status: "APPROVED",
      txn_type: "PURCHASE",
      authorization_code: "AUTH123",
      response_code: "00",
      amount_paid: "138.00",
      product_statuses: [
        {
          product_id: "top-01",
          product_ref_id: "prd_1",
          amount_paid: "49.00",
        },
      ],
    });
    expect(
      buildPravaReportStatusRequest({
        transactionReferenceId: "tli_fitora_123",
        status: "DECLINED",
      }),
    ).toEqual({
      txn_ref_id: "tli_fitora_123",
      txn_status: "DECLINED",
    });
  });

  it("requires a confirmed response and preserves only documented status facts", () => {
    expect(
      parsePravaReportStatusResult({
        status: "confirmed",
        txn_ref_id: "tli_fitora_123",
        txn_status: "APPROVED",
        visa_confirmation: "SUCCESS",
      }),
    ).toEqual({
      status: "confirmed",
      transactionReferenceId: "tli_fitora_123",
      transactionStatus: "APPROVED",
      visaConfirmation: "SUCCESS",
    });
    expect(() =>
      parsePravaReportStatusResult({
        status: "ok",
        txn_ref_id: "tli_fitora_123",
      }),
    ).toThrow("The Prava report-status contract is invalid.");
  });
});
