import { describe, expect, it } from "vitest";

import {
  CHECKOUT_HISTORY_LIMIT,
  CHECKOUT_HISTORY_STORAGE_KEY,
  readSanitizedOrderHistory,
  writeSanitizedOrderHistory,
  type SanitizedOrderHistoryEntry,
} from "@/lib/checkout/history";

function memoryStorage(initial?: string) {
  let value = initial ?? null;

  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    serialized: () => value,
  };
}

function entry(index = 0): SanitizedOrderHistoryEntry {
  return {
    version: 1,
    provider: "mock",
    status: "approved",
    orderReference: `FITORA-ORDER-${index}`,
    currency: "USD",
    totalCents: 12_000 + index,
    itemCount: 3,
    completedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  };
}

describe("sanitized checkout history", () => {
  it("persists only the strict sanitized shape and deduplicates entries", () => {
    const storage = memoryStorage();

    expect(writeSanitizedOrderHistory(storage, entry())).toBe(true);
    expect(writeSanitizedOrderHistory(storage, entry())).toBe(true);
    expect(readSanitizedOrderHistory(storage)).toEqual([entry()]);
    expect(storage.serialized()).not.toMatch(
      /email|session|token|card|cvv|expiry/i,
    );
  });

  it("rejects extra sensitive fields and corrupt persisted data", () => {
    const storage = memoryStorage();

    expect(
      writeSanitizedOrderHistory(storage, {
        ...entry(),
        email: "person@example.com",
      }),
    ).toBe(false);
    expect(storage.serialized()).toBeNull();
    expect(
      readSanitizedOrderHistory(memoryStorage("not-json")),
    ).toEqual([]);
  });

  it("keeps only the five newest sanitized results", () => {
    const storage = memoryStorage();

    for (let index = 0; index < CHECKOUT_HISTORY_LIMIT + 2; index += 1) {
      expect(writeSanitizedOrderHistory(storage, entry(index))).toBe(true);
    }

    const history = readSanitizedOrderHistory(storage);
    expect(history).toHaveLength(CHECKOUT_HISTORY_LIMIT);
    expect(history[0]).toEqual(entry(CHECKOUT_HISTORY_LIMIT + 1));
  });

  it("uses a versioned, product-specific storage key", () => {
    expect(CHECKOUT_HISTORY_STORAGE_KEY).toBe(
      "fitora:sanitized-order-history:v1",
    );
  });
});
