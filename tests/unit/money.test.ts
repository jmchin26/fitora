import { describe, expect, it } from "vitest";

import {
  centsToDecimalString,
  formatUsd,
  sumCents,
} from "@/lib/money";

describe("money helpers", () => {
  it("keeps arithmetic in integer cents", () => {
    expect(sumCents([3_499, 5_001, 4_250])).toBe(12_750);
  });

  it("formats only at integration and display boundaries", () => {
    expect(formatUsd(12_750)).toBe("$127.50");
    expect(centsToDecimalString(12_750)).toBe("127.50");
  });

  it("rejects fractional, negative, or unsafe amounts", () => {
    expect(() => sumCents([100.5])).toThrow(RangeError);
    expect(() => formatUsd(-1)).toThrow(RangeError);
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

