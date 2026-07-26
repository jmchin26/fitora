import { z } from "zod";

export const CHECKOUT_HISTORY_STORAGE_KEY =
  "fitora:sanitized-order-history:v1";
export const CHECKOUT_HISTORY_LIMIT = 5;

export const SanitizedOrderHistoryEntrySchema = z
  .object({
    version: z.literal(1),
    provider: z.enum(["mock", "prava"]),
    status: z.enum(["approved", "declined"]),
    orderReference: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9-]+$/)
      .optional(),
    currency: z.literal("USD"),
    totalCents: z.number().int().positive(),
    itemCount: z.literal(3),
    completedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.status === "approved" && !entry.orderReference) {
      context.addIssue({
        code: "custom",
        path: ["orderReference"],
        message: "Approved history entries require an order reference.",
      });
    }

    if (entry.status === "declined" && entry.orderReference) {
      context.addIssue({
        code: "custom",
        path: ["orderReference"],
        message: "Declined history entries cannot contain an order reference.",
      });
    }
  });

const SanitizedOrderHistorySchema = z
  .array(SanitizedOrderHistoryEntrySchema)
  .max(CHECKOUT_HISTORY_LIMIT);

export type SanitizedOrderHistoryEntry = z.infer<
  typeof SanitizedOrderHistoryEntrySchema
>;

export function readSanitizedOrderHistory(
  storage: Pick<Storage, "getItem">,
): SanitizedOrderHistoryEntry[] {
  try {
    const serialized = storage.getItem(CHECKOUT_HISTORY_STORAGE_KEY);

    if (!serialized) {
      return [];
    }

    const parsed = SanitizedOrderHistorySchema.safeParse(
      JSON.parse(serialized) as unknown,
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeSanitizedOrderHistory(
  storage: Pick<Storage, "getItem" | "setItem">,
  candidate: unknown,
): boolean {
  const entry = SanitizedOrderHistoryEntrySchema.safeParse(candidate);

  if (!entry.success) {
    return false;
  }

  try {
    const current = readSanitizedOrderHistory(storage);
    const identity =
      entry.data.orderReference ??
      `${entry.data.provider}:${entry.data.status}:${entry.data.completedAt}:${entry.data.totalCents}`;
    const next = [
      entry.data,
      ...current.filter((item) => {
        const itemIdentity =
          item.orderReference ??
          `${item.provider}:${item.status}:${item.completedAt}:${item.totalCents}`;
        return itemIdentity !== identity;
      }),
    ].slice(0, CHECKOUT_HISTORY_LIMIT);

    storage.setItem(CHECKOUT_HISTORY_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
