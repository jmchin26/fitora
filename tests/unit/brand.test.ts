import { describe, expect, it } from "vitest";

import { brand } from "@/lib/brand";

describe("Fitora brand contract", () => {
  it("keeps the approved product name and tagline", () => {
    expect(brand).toEqual({
      name: "Fitora",
      tagline: "Style that fits the moment.",
    });
  });
});

