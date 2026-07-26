import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateOutfits } from "@/lib/styling/generate";
import {
  FITORA_BUILD_STATE_KEY,
  readBuildState,
  toSafeSelectedOutfit,
  writeBuildState,
} from "@/components/build/storage";
import type { UserPreferences } from "@/lib/catalogue/schemas";

const preferences: UserPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

function firstGeneratedOutfit() {
  const result = generateOutfits(preferences);

  if (!result.ok) {
    throw new Error("The standard preferences must produce test outfits.");
  }

  return result.outfits[0];
}

describe("safe build-state persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores and restores only product references for the selected outfit", () => {
    const selectedOutfit = toSafeSelectedOutfit(firstGeneratedOutfit());

    expect(
      writeBuildState({
        version: 1,
        preferences,
        selectedOutfit,
      }),
    ).toBe(true);

    const storedValue = window.localStorage.getItem(FITORA_BUILD_STATE_KEY);

    expect(storedValue).not.toContain("priceCents");
    expect(storedValue).not.toContain("stockBySize");
    expect(readBuildState()).toEqual({
      status: "loaded",
      state: {
        version: 1,
        preferences,
        selectedOutfit,
      },
    });
  });

  it("removes schema-invalid data and reports a recoverable corrupt state", () => {
    window.localStorage.setItem(
      FITORA_BUILD_STATE_KEY,
      JSON.stringify({
        version: 1,
        preferences: { ...preferences, budgetCents: "150.00" },
        selectedOutfit: null,
      }),
    );

    expect(readBuildState()).toEqual({ status: "corrupt" });
    expect(window.localStorage.getItem(FITORA_BUILD_STATE_KEY)).toBeNull();
  });

  it("removes malformed JSON and reports a recoverable corrupt state", () => {
    window.localStorage.setItem(FITORA_BUILD_STATE_KEY, "{not valid json");

    expect(readBuildState()).toEqual({ status: "corrupt" });
    expect(window.localStorage.getItem(FITORA_BUILD_STATE_KEY)).toBeNull();
  });

  it("reports unavailable storage when reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });

    expect(readBuildState()).toEqual({ status: "unavailable" });
  });

  it("returns false when writes are blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });

    expect(
      writeBuildState({
        version: 1,
        preferences,
        selectedOutfit: null,
      }),
    ).toBe(false);
  });
});
