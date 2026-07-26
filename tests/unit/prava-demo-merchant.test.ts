import { describe, expect, it } from "vitest";

import { verifyCheckoutOrder, type VerifiedOrder } from "@/lib/checkout/order";
import {
  createPravaDemoMerchant,
  PravaDemoMerchantCheckoutInputSchema,
  type PravaDemoMerchantCheckoutInput,
} from "@/lib/merchant/prava-demo-merchant";
import { generateOutfits } from "@/lib/styling/generate";

const FAKE_CREDENTIALS = {
  token: "FAKE_ONE_TIME_TOKEN_NOT_PAYMENT_DATA",
  dynamicCvv: "FAKE_DYNAMIC_CVV_NOT_PAYMENT_DATA",
  expiryMonth: 12,
  expiryYear: 2099,
} as const;

const CREDENTIAL_KEYS = [
  "credentials",
  "token",
  "dynamicCvv",
  "expiryMonth",
  "expiryYear",
] as const;

function verifiedOrderFixture(): VerifiedOrder {
  const generated = generateOutfits({
    occasion: "casual_event",
    budgetCents: 20_000,
    topSize: "M",
    bottomSize: "M",
    shoeSize: "42",
    preferredColors: ["olive"],
    excludedColors: [],
    style: "relaxed",
  });

  if (!generated.ok || !generated.outfits[0]) {
    throw new Error("Expected an outfit fixture.");
  }

  const outfit = generated.outfits[0];
  const verified = verifyCheckoutOrder({
    outfit: {
      top: {
        productId: outfit.top.product.id,
        selectedSize: outfit.top.selectedSize,
      },
      bottom: {
        productId: outfit.bottom.product.id,
        selectedSize: outfit.bottom.selectedSize,
      },
      shoes: {
        productId: outfit.shoes.product.id,
        selectedSize: outfit.shoes.selectedSize,
      },
    },
  });

  if (!verified.ok) {
    throw new Error("Expected a verified order fixture.");
  }

  return verified.order;
}

function checkoutInput(
  overrides: Partial<PravaDemoMerchantCheckoutInput> = {},
): PravaDemoMerchantCheckoutInput {
  const order = verifiedOrderFixture();

  return {
    order,
    sessionId: "session_FAKE_TEST_ONLY_001",
    txnRefId: "txn_ref_FAKE_TEST_ONLY_001",
    credentials: FAKE_CREDENTIALS,
    context: {
      merchantId: order.merchantId,
      currency: order.currency,
      totalCents: order.totalCents,
    },
    ...overrides,
  };
}

function collectLeafValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectLeafValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(collectLeafValues);
  }

  return [value];
}

function expectCredentialFree(value: unknown): void {
  const serialized = JSON.stringify(value);
  const leaves = collectLeafValues(value);

  for (const key of CREDENTIAL_KEYS) {
    expect(serialized).not.toContain(`"${key}"`);
  }

  expect(serialized).not.toContain(FAKE_CREDENTIALS.token);
  expect(serialized).not.toContain(FAKE_CREDENTIALS.dynamicCvv);
  expect(leaves).not.toContain(FAKE_CREDENTIALS.expiryMonth);
  expect(leaves).not.toContain(FAKE_CREDENTIALS.expiryYear);
}

describe("Prava sandbox demo merchant", () => {
  it("returns deterministic approval and report-status codes without credentials", async () => {
    const merchant = createPravaDemoMerchant({
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    });
    const input = checkoutInput();
    const signal = new AbortController().signal;

    const first = await merchant.checkout(input, signal);
    const duplicate = await merchant.checkout(
      {
        ...input,
        credentials: {
          ...FAKE_CREDENTIALS,
          token: "A_DIFFERENT_FAKE_ONE_TIME_TOKEN",
          dynamicCvv: "A_DIFFERENT_FAKE_DYNAMIC_CVV",
        },
      },
      signal,
    );

    expect(first).toEqual({
      status: "approved",
      orderReference: expect.stringMatching(/^FITORA-PRAVA-[A-F0-9]{16}$/),
      reportStatus: "APPROVED",
      authorizationCode: expect.stringMatching(/^[A-F0-9]{6}$/),
      responseCode: "00",
    });
    expect(duplicate).toEqual(first);
    expectCredentialFree(first);
    expectCredentialFree(duplicate);
  });

  it("declines an amount-context mismatch with a reportable result", async () => {
    const input = checkoutInput();
    const result = await createPravaDemoMerchant().checkout(
      {
        ...input,
        context: {
          ...input.context,
          totalCents: input.context.totalCents + 1,
        },
      },
      new AbortController().signal,
    );

    expect(result).toEqual({
      status: "declined",
      reasonCode: "CONTEXT_MISMATCH",
      reportStatus: "DECLINED",
      authorizationCode: "000000",
      responseCode: "13",
    });
    expectCredentialFree(result);
  });

  it("rejects expired one-time credentials without exposing them", async () => {
    const input = checkoutInput({
      credentials: {
        ...FAKE_CREDENTIALS,
        expiryMonth: 11,
        expiryYear: 2029,
      },
    });
    const result = await createPravaDemoMerchant({
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    }).checkout(input, new AbortController().signal);

    expect(result).toEqual({
      status: "declined",
      reasonCode: "INVALID_CREDENTIAL",
      reportStatus: "DECLINED",
      authorizationCode: "000000",
      responseCode: "14",
    });
    expectCredentialFree(result);
  });

  it("supports a deterministic server-configured forced decline", async () => {
    const result = await createPravaDemoMerchant({
      forceDecline: true,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
    }).checkout(checkoutInput(), new AbortController().signal);

    expect(result).toEqual({
      status: "declined",
      reasonCode: "FORCED_DECLINE",
      reportStatus: "DECLINED",
      authorizationCode: "000000",
      responseCode: "05",
    });
    expectCredentialFree(result);
  });

  it("fails closed on malformed input without returning validation details", async () => {
    const malformedInput = {
      ...checkoutInput(),
      credentials: {
        ...FAKE_CREDENTIALS,
        internalDebugCopy: "FAKE_SECRET_COPY_MUST_NOT_ESCAPE",
      },
    };

    expect(
      PravaDemoMerchantCheckoutInputSchema.safeParse(malformedInput).success,
    ).toBe(false);

    const result = await createPravaDemoMerchant().checkout(
      malformedInput,
      new AbortController().signal,
    );

    expect(result).toEqual({
      status: "declined",
      reasonCode: "INVALID_INPUT",
      reportStatus: "DECLINED",
      authorizationCode: "000000",
      responseCode: "30",
    });
    expectCredentialFree(result);
    expect(JSON.stringify(result)).not.toContain("internalDebugCopy");
    expect(JSON.stringify(result)).not.toContain(
      "FAKE_SECRET_COPY_MUST_NOT_ESCAPE",
    );
  });

  it("aborts with a generic error that contains no credential material", async () => {
    const controller = new AbortController();
    const input = checkoutInput();
    controller.abort();

    const caught = await createPravaDemoMerchant()
      .checkout(input, controller.signal)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DOMException);

    const sanitizedError =
      caught instanceof DOMException
        ? { name: caught.name, message: caught.message }
        : { name: "UnknownError", message: String(caught) };

    expect(sanitizedError).toEqual({
      name: "AbortError",
      message: "The Prava demo merchant request was cancelled.",
    });
    expectCredentialFree(sanitizedError);
  });
});
