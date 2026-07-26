import { z } from "zod";

import {
  CHECKOUT_CURRENCY,
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";

export const PRAVA_SANDBOX_ORIGIN =
  "https://sandbox.api.prava.space" as const;
export const PRAVA_PRODUCTION_ORIGIN =
  "https://api.prava.space" as const;
export const PRAVA_SANDBOX_HOSTED_ORIGIN =
  "https://sandbox.collect.prava.space" as const;
export const PRAVA_PRODUCTION_HOSTED_ORIGIN =
  "https://collect.prava.space" as const;

export const PRAVA_SESSION_EFFECTIVE_MINUTES = 15 as const;

const SafeIdentifierSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const SafeTextSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value === value.trim(), {
    message: "Text must not have surrounding whitespace.",
  })
  .refine(
    (value) =>
      [...value].every((character) => {
        const point = character.codePointAt(0) ?? 0;
        return point >= 32 && point !== 127;
      }),
    { message: "Text must not contain control characters." },
  );

const HttpsUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.username.length === 0 &&
        url.password.length === 0
      );
    } catch {
      return false;
    }
  }, "A credential-free HTTPS URL is required.");

const HttpsOriginSchema = HttpsUrlSchema.refine((value) => {
  const url = new URL(value);
  return (
    url.pathname === "/" &&
    url.search.length === 0 &&
    url.hash.length === 0
  );
}, "A credential-free HTTPS origin is required.").transform(
  (value) => new URL(value).origin,
);

export const PravaDecimalAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,13})\.\d{2}$/);

const PositivePravaDecimalAmountSchema =
  PravaDecimalAmountSchema.refine((value) => value !== "0.00", {
    message: "The amount must be positive.",
  });

export const PravaSessionIdSchema = SafeIdentifierSchema;
export const PravaTransactionReferenceSchema = SafeIdentifierSchema;

export function formatPravaAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("The Prava amount is invalid.");
  }

  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const amount = `${whole}.${fraction}`;

  if (!PravaDecimalAmountSchema.safeParse(amount).success) {
    throw new Error("The Prava amount is invalid.");
  }

  return amount;
}

export const PravaMerchantSchema = z
  .object({
    name: SafeTextSchema.max(80),
    url: HttpsOriginSchema,
    countryCode: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

export type PravaMerchant = z.infer<typeof PravaMerchantSchema>;

const PravaMerchantDetailsWireSchema = z
  .object({
    name: SafeTextSchema.max(80),
    url: HttpsOriginSchema,
    country_code_iso2: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

const PravaProductDetailsWireSchema = z
  .object({
    description: SafeTextSchema,
    unit_price: PositivePravaDecimalAmountSchema,
    quantity: z.number().int().positive().max(1_000_000),
    product_id: SafeIdentifierSchema.optional(),
  })
  .strict();

const PravaPurchaseContextWireSchema = z
  .object({
    merchant_details: PravaMerchantDetailsWireSchema,
    product_details: z.tuple([
      PravaProductDetailsWireSchema,
      PravaProductDetailsWireSchema,
      PravaProductDetailsWireSchema,
    ]),
    effective_until_minutes: z.literal(
      PRAVA_SESSION_EFFECTIVE_MINUTES,
    ),
  })
  .strict();

export const PravaCreateSessionRequestSchema = z
  .object({
    user_id: z
      .string()
      .min(1)
      .max(255)
      .regex(/^fitora_[A-Za-z0-9_-]{43}$/),
    user_email: z.string().trim().toLowerCase().email().max(254),
    total_amount: PositivePravaDecimalAmountSchema,
    currency: z.literal(CHECKOUT_CURRENCY),
    purchase_context: z.tuple([PravaPurchaseContextWireSchema]),
    external_order_ref: SafeIdentifierSchema,
    description: SafeTextSchema,
    integration_type: z.literal("full_checkout"),
    callback_url: HttpsUrlSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const productTotalCents = request.purchase_context[0].product_details
      .map((product) => {
        const [whole, fraction] = product.unit_price.split(".");
        return (
          (BigInt(whole) * 100n + BigInt(fraction)) *
          BigInt(product.quantity)
        );
      })
      .reduce((total, amount) => total + amount, 0n);
    const [totalWhole, totalFraction] = request.total_amount.split(".");
    const totalCents =
      BigInt(totalWhole) * 100n + BigInt(totalFraction);

    if (productTotalCents !== totalCents) {
      context.addIssue({
        code: "custom",
        message: "Product amounts must equal the session total.",
        path: ["purchase_context", 0, "product_details"],
      });
    }
  });

export type PravaCreateSessionRequest = z.infer<
  typeof PravaCreateSessionRequestSchema
>;

export const PravaCreateSessionInputSchema = z
  .object({
    order: VerifiedOrderSchema,
    email: z.string().trim().toLowerCase().email().max(254),
    callbackUrl: HttpsUrlSchema,
  })
  .strict();

export type PravaCreateSessionInput = z.input<
  typeof PravaCreateSessionInputSchema
>;

export type ParsedPravaCreateSessionInput = z.output<
  typeof PravaCreateSessionInputSchema
>;

export const PravaCreatedSessionSchema = z
  .object({
    sessionId: PravaSessionIdSchema,
    hostedUrl: HttpsUrlSchema,
    orderId: SafeIdentifierSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export type PravaCreatedSession = z.infer<
  typeof PravaCreatedSessionSchema
>;

export const PravaPaymentResultStatuses = [
  "pending",
  "awaiting_result",
  "completed",
  "failed",
] as const;

const PravaPaymentResultStatusSchema = z.enum(
  PravaPaymentResultStatuses,
);

const PravaPaymentProductWireSchema = z
  .object({
    product_ref_id: SafeIdentifierSchema,
    external_product_id: SafeIdentifierSchema.nullable().optional(),
    name: SafeTextSchema,
    unit_price: PositivePravaDecimalAmountSchema,
    quantity: z.number().int().positive().max(1_000_000),
  })
  .strict();

const PravaTransactionErrorWireSchema = z
  .object({
    code: SafeIdentifierSchema,
    message: SafeTextSchema.max(1_024),
  })
  .strict();

const PravaLineItemWireSchema = z
  .object({
    txn_ref_id: PravaTransactionReferenceSchema,
    merchant_name: SafeTextSchema.max(80),
    merchant_url: HttpsOriginSchema,
    total_amount: PositivePravaDecimalAmountSchema,
    status: PravaPaymentResultStatusSchema,
    token: z.string().min(8).max(256).optional(),
    dynamic_cvv: z.string().regex(/^\d{3,4}$/).optional(),
    expiry_month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
    expiry_year: z.string().regex(/^\d{4}$/).optional(),
    products: z.array(PravaPaymentProductWireSchema).min(1),
  })
  .strict();

const PravaTransactionWireSchema = z
  .object({
    txn_id: SafeIdentifierSchema,
    status: PravaPaymentResultStatusSchema.optional(),
    line_items: z.array(PravaLineItemWireSchema),
    error: PravaTransactionErrorWireSchema.nullable().optional(),
  })
  .strict();

const PravaPaymentResultWireSchema = z
  .object({
    session_id: PravaSessionIdSchema,
    order_id: SafeIdentifierSchema.nullable(),
    status: PravaPaymentResultStatusSchema,
    transactions: z.array(PravaTransactionWireSchema),
  })
  .strict();

const PravaCredentialSchema = z
  .object({
    token: z.string().min(8).max(256),
    dynamicCvv: z.string().regex(/^\d{3,4}$/),
    expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/),
    expiryYear: z.string().regex(/^\d{4}$/),
  })
  .strict();

const PravaPaymentProductSchema = z
  .object({
    productReferenceId: SafeIdentifierSchema,
    externalProductId: SafeIdentifierSchema.nullable(),
    name: SafeTextSchema,
    unitPrice: PositivePravaDecimalAmountSchema,
    quantity: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const PravaAwaitingResultLineItemSchema = z
  .object({
    transactionReferenceId: PravaTransactionReferenceSchema,
    merchantName: SafeTextSchema.max(80),
    merchantUrl: HttpsOriginSchema,
    totalAmount: PositivePravaDecimalAmountSchema,
    credential: PravaCredentialSchema,
    products: z.array(PravaPaymentProductSchema).min(1),
  })
  .strict();

export type PravaAwaitingResultLineItem = z.infer<
  typeof PravaAwaitingResultLineItemSchema
>;

const PravaAwaitingResultTransactionSchema = z
  .object({
    transactionId: SafeIdentifierSchema,
    lineItems: z.array(PravaAwaitingResultLineItemSchema).min(1),
  })
  .strict();

const PravaResultBaseShape = {
  sessionId: PravaSessionIdSchema,
  orderId: SafeIdentifierSchema.nullable(),
};

export const PravaPaymentResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...PravaResultBaseShape,
      status: z.literal("pending"),
    })
    .strict(),
  z
    .object({
      ...PravaResultBaseShape,
      status: z.literal("awaiting_result"),
      transactions: z
        .array(PravaAwaitingResultTransactionSchema)
        .min(1),
    })
    .strict(),
  z
    .object({
      ...PravaResultBaseShape,
      status: z.literal("completed"),
    })
    .strict(),
  z
    .object({
      ...PravaResultBaseShape,
      status: z.literal("failed"),
    })
    .strict(),
]);

export type PravaPaymentResult = z.infer<
  typeof PravaPaymentResultSchema
>;

export function parsePravaPaymentResult(
  input: unknown,
): PravaPaymentResult {
  const wire = PravaPaymentResultWireSchema.safeParse(input);

  if (!wire.success) {
    throw new Error("The Prava payment-result contract is invalid.");
  }

  const base = {
    sessionId: wire.data.session_id,
    orderId: wire.data.order_id,
  };

  if (wire.data.status !== "awaiting_result") {
    const result = PravaPaymentResultSchema.safeParse({
      ...base,
      status: wire.data.status,
    });

    if (!result.success) {
      throw new Error("The Prava payment-result contract is invalid.");
    }

    return result.data;
  }

  const transactions = wire.data.transactions.map((transaction) => {
    if (
      transaction.status !== undefined &&
      transaction.status !== "awaiting_result"
    ) {
      throw new Error("The Prava payment-result contract is invalid.");
    }

    return {
      transactionId: transaction.txn_id,
      lineItems: transaction.line_items.map((lineItem) => {
        if (
          lineItem.status !== "awaiting_result" ||
          lineItem.token === undefined ||
          lineItem.dynamic_cvv === undefined ||
          lineItem.expiry_month === undefined ||
          lineItem.expiry_year === undefined
        ) {
          throw new Error(
            "The Prava payment-result contract is invalid.",
          );
        }

        return {
          transactionReferenceId: lineItem.txn_ref_id,
          merchantName: lineItem.merchant_name,
          merchantUrl: lineItem.merchant_url,
          totalAmount: lineItem.total_amount,
          credential: {
            token: lineItem.token,
            dynamicCvv: lineItem.dynamic_cvv,
            expiryMonth: lineItem.expiry_month,
            expiryYear: lineItem.expiry_year,
          },
          products: lineItem.products.map((product) => ({
            productReferenceId: product.product_ref_id,
            externalProductId: product.external_product_id ?? null,
            name: product.name,
            unitPrice: product.unit_price,
            quantity: product.quantity,
          })),
        };
      }),
    };
  });
  const result = PravaPaymentResultSchema.safeParse({
    ...base,
    status: wire.data.status,
    transactions,
  });

  if (!result.success) {
    throw new Error("The Prava payment-result contract is invalid.");
  }

  return result.data;
}

export const PravaTransactionStatuses = [
  "APPROVED",
  "DECLINED",
] as const;

export const PravaReportStatusInputSchema = z
  .object({
    transactionReferenceId: PravaTransactionReferenceSchema,
    status: z.enum(PravaTransactionStatuses),
    transactionType: z.literal("PURCHASE").optional(),
    authorizationCode: z.string().min(1).max(128).optional(),
    responseCode: z.string().regex(/^[A-Za-z0-9]{1,2}$/).optional(),
    amountPaidCents: z.number().int().nonnegative().optional(),
    productStatuses: z
      .array(
        z
          .object({
            productId: SafeIdentifierSchema.optional(),
            productReferenceId: SafeIdentifierSchema.optional(),
            amountPaidCents: z.number().int().nonnegative().optional(),
          })
          .strict()
          .refine(
            (status) =>
              status.productId !== undefined ||
              status.productReferenceId !== undefined,
            "A product identifier is required.",
          ),
      )
      .min(1)
      .optional(),
  })
  .strict();

export type PravaReportStatusInput = z.input<
  typeof PravaReportStatusInputSchema
>;

export const PravaReportStatusRequestSchema = z
  .object({
    txn_ref_id: PravaTransactionReferenceSchema,
    txn_status: z.enum(PravaTransactionStatuses),
    txn_type: z.literal("PURCHASE").optional(),
    authorization_code: z.string().min(1).max(128).optional(),
    response_code: z.string().regex(/^[A-Za-z0-9]{1,2}$/).optional(),
    amount_paid: PravaDecimalAmountSchema.optional(),
    product_statuses: z
      .array(
        z
          .object({
            product_id: SafeIdentifierSchema.optional(),
            product_ref_id: SafeIdentifierSchema.optional(),
            amount_paid: PravaDecimalAmountSchema.optional(),
          })
          .strict()
          .refine(
            (status) =>
              status.product_id !== undefined ||
              status.product_ref_id !== undefined,
            "A product identifier is required.",
          ),
      )
      .min(1)
      .optional(),
  })
  .strict();

export type PravaReportStatusRequest = z.infer<
  typeof PravaReportStatusRequestSchema
>;

export function buildPravaReportStatusRequest(
  input: PravaReportStatusInput,
): PravaReportStatusRequest {
  const parsed = PravaReportStatusInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error("The Prava report-status input is invalid.");
  }

  const request = PravaReportStatusRequestSchema.safeParse({
    txn_ref_id: parsed.data.transactionReferenceId,
    txn_status: parsed.data.status,
    ...(parsed.data.transactionType
      ? { txn_type: parsed.data.transactionType }
      : {}),
    ...(parsed.data.authorizationCode
      ? { authorization_code: parsed.data.authorizationCode }
      : {}),
    ...(parsed.data.responseCode
      ? { response_code: parsed.data.responseCode }
      : {}),
    ...(parsed.data.amountPaidCents === undefined
      ? {}
      : { amount_paid: formatPravaAmount(parsed.data.amountPaidCents) }),
    ...(parsed.data.productStatuses
      ? {
          product_statuses: parsed.data.productStatuses.map((status) => ({
            ...(status.productId
              ? { product_id: status.productId }
              : {}),
            ...(status.productReferenceId
              ? { product_ref_id: status.productReferenceId }
              : {}),
            ...(status.amountPaidCents === undefined
              ? {}
              : {
                  amount_paid: formatPravaAmount(
                    status.amountPaidCents,
                  ),
                }),
          })),
        }
      : {}),
  });

  if (!request.success) {
    throw new Error("The Prava report-status input is invalid.");
  }

  return request.data;
}

export const PravaReportStatusResultSchema = z
  .object({
    status: z.literal("confirmed"),
    transactionReferenceId: PravaTransactionReferenceSchema,
    transactionStatus: z.enum(PravaTransactionStatuses).optional(),
    visaConfirmation: z.enum(["SUCCESS", "FAILURE"]).optional(),
  })
  .strict();

export type PravaReportStatusResult = z.infer<
  typeof PravaReportStatusResultSchema
>;

const PravaReportStatusResponseWireSchema = z
  .object({
    status: z.literal("confirmed"),
    txn_ref_id: PravaTransactionReferenceSchema,
    txn_status: z.enum(PravaTransactionStatuses).optional(),
    visa_confirmation: z.enum(["SUCCESS", "FAILURE"]).optional(),
  })
  .strict();

export function parsePravaReportStatusResult(
  input: unknown,
): PravaReportStatusResult {
  const wire = PravaReportStatusResponseWireSchema.safeParse(input);

  if (!wire.success) {
    throw new Error("The Prava report-status contract is invalid.");
  }

  return {
    status: wire.data.status,
    transactionReferenceId: wire.data.txn_ref_id,
    ...(wire.data.txn_status
      ? { transactionStatus: wire.data.txn_status }
      : {}),
    ...(wire.data.visa_confirmation
      ? { visaConfirmation: wire.data.visa_confirmation }
      : {}),
  };
}

export type BuildPravaCreateSessionRequestInput = Readonly<{
  order: VerifiedOrder;
  normalizedEmail: string;
  userId: string;
  callbackUrl: string;
  merchant: PravaMerchant;
  externalOrderReference: string;
}>;

export function buildPravaCreateSessionRequest(
  input: BuildPravaCreateSessionRequestInput,
): PravaCreateSessionRequest {
  const order = VerifiedOrderSchema.safeParse(input.order);
  const merchant = PravaMerchantSchema.safeParse(input.merchant);

  if (!order.success || !merchant.success) {
    throw new Error("The Prava create-session input is invalid.");
  }

  const request = PravaCreateSessionRequestSchema.safeParse({
    user_id: input.userId,
    user_email: input.normalizedEmail,
    total_amount: formatPravaAmount(order.data.totalCents),
    currency: order.data.currency,
    purchase_context: [
      {
        merchant_details: {
          name: merchant.data.name,
          url: merchant.data.url,
          country_code_iso2: merchant.data.countryCode,
        },
        product_details: order.data.items.map((item) => ({
          description: item.name,
          unit_price: formatPravaAmount(item.unitPriceCents),
          quantity: item.quantity,
          product_id: item.productId,
        })),
        effective_until_minutes: PRAVA_SESSION_EFFECTIVE_MINUTES,
      },
    ],
    external_order_ref: input.externalOrderReference,
    description: "Fitora complete outfit",
    integration_type: "full_checkout",
    callback_url: input.callbackUrl,
  });

  if (!request.success) {
    throw new Error("The Prava create-session input is invalid.");
  }

  return request.data;
}
