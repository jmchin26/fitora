import {
  VerifiedOrderSchema,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  PravaMerchantSchema,
  formatPravaAmount,
  type PravaAwaitingResultLineItem,
  type PravaMerchant,
  type PravaPaymentResult,
} from "@/lib/payments/prava";

export type PravaAwaitingContextResolution =
  | Readonly<{
      ok: true;
      lineItem: PravaAwaitingResultLineItem;
    }>
  | Readonly<{
      ok: false;
      reason: "INVALID_PROVIDER_CONTEXT";
    }>
  | Readonly<{
      ok: false;
      reason: "CANONICAL_CONTEXT_MISMATCH";
      transactionReference: string;
    }>;

function invalidContext(): PravaAwaitingContextResolution {
  return { ok: false, reason: "INVALID_PROVIDER_CONTEXT" };
}

function canonicalContextMismatch(
  transactionReference: string,
): PravaAwaitingContextResolution {
  return {
    ok: false,
    reason: "CANONICAL_CONTEXT_MISMATCH",
    transactionReference,
  };
}

/**
 * Reduces the credential-bearing provider result to the one canonical line
 * item Fitora is allowed to execute. No client-supplied product facts are
 * considered and no credential value is copied or serialized here.
 */
export function resolvePravaAwaitingContext(
  result: PravaPaymentResult,
  order: VerifiedOrder,
  merchant: PravaMerchant,
): PravaAwaitingContextResolution {
  const parsedOrder = VerifiedOrderSchema.safeParse(order);
  const parsedMerchant = PravaMerchantSchema.safeParse(merchant);

  if (
    !parsedOrder.success ||
    !parsedMerchant.success ||
    result.status !== "awaiting_result" ||
    result.transactions.length !== 1 ||
    result.transactions[0]?.lineItems.length !== 1
  ) {
    return invalidContext();
  }

  const lineItem = result.transactions[0].lineItems[0];

  if (!lineItem) {
    return invalidContext();
  }

  let lineItemMerchantOrigin: string;

  try {
    lineItemMerchantOrigin = new URL(lineItem.merchantUrl).origin;
  } catch {
    return invalidContext();
  }

  if (
    lineItem.merchantName !== parsedMerchant.data.name ||
    lineItemMerchantOrigin !== parsedMerchant.data.url ||
    lineItem.totalAmount !==
      formatPravaAmount(parsedOrder.data.totalCents) ||
    lineItem.products.length !== parsedOrder.data.items.length
  ) {
    return canonicalContextMismatch(
      lineItem.transactionReferenceId,
    );
  }

  const expectedProducts = new Map(
    parsedOrder.data.items.map((item) => [item.productId, item] as const),
  );
  const seenExternalIds = new Set<string>();
  const seenProviderReferences = new Set<string>();

  for (const product of lineItem.products) {
    if (
      product.externalProductId === null ||
      seenExternalIds.has(product.externalProductId) ||
      seenProviderReferences.has(product.productReferenceId)
    ) {
      return canonicalContextMismatch(
        lineItem.transactionReferenceId,
      );
    }

    const expected = expectedProducts.get(product.externalProductId);

    if (
      !expected ||
      product.name !== expected.name ||
      product.unitPrice !== formatPravaAmount(expected.unitPriceCents) ||
      product.quantity !== expected.quantity
    ) {
      return canonicalContextMismatch(
        lineItem.transactionReferenceId,
      );
    }

    seenExternalIds.add(product.externalProductId);
    seenProviderReferences.add(product.productReferenceId);
  }

  return { ok: true, lineItem };
}
