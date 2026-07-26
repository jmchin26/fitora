import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/outfits/generate/route";

const standardPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
} as const;

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/outfits/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/outfits/generate", () => {
  it("returns three server-generated outfits for the standard request", async () => {
    const response = await POST(requestWith(standardPreferences));
    const body = (await response.json()) as {
      ok: boolean;
      outfits: Array<{ totalCents: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.outfits).toHaveLength(3);
    expect(
      body.outfits.every((outfit) => outfit.totalCents <= 15_000),
    ).toBe(true);
  });

  it("rejects values outside the strict preference contract", async () => {
    const response = await POST(
      requestWith({ ...standardPreferences, budgetCents: 150.5 }),
    );
    const body = (await response.json()) as {
      error: { code: string; fields: Record<string, string[]> };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_PREFERENCES");
    expect(body.error.fields.budgetCents).toBeDefined();
  });

  it("returns a corrective response instead of an over-budget outfit", async () => {
    const response = await POST(
      requestWith({ ...standardPreferences, budgetCents: 2_000 }),
    );
    const body = (await response.json()) as {
      error: { code: string };
      diagnostics: { minimumAchievableTotalCents: number };
    };

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("NO_OUTFIT_WITHIN_BUDGET");
    expect(body.diagnostics.minimumAchievableTotalCents).toBeGreaterThan(
      2_000,
    );
  });
});

