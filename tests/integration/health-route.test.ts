import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

const originalAiProvider = process.env.AI_PROVIDER;
const originalPaymentProvider = process.env.PAYMENT_PROVIDER;

afterEach(() => {
  if (originalAiProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalAiProvider;
  }

  if (originalPaymentProvider === undefined) {
    delete process.env.PAYMENT_PROVIDER;
  } else {
    process.env.PAYMENT_PROVIDER = originalPaymentProvider;
  }
});

describe("GET /api/health", () => {
  it("reports truthful safe defaults without exposing configuration", async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.PAYMENT_PROVIDER;

    const response = await GET();
    const body = (await response.json()) as {
      status: string;
      providers: { ai: string; payment: string };
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "fitora",
      providers: { ai: "rules", payment: "mock" },
    });
    expect(JSON.stringify(body)).not.toMatch(/key|secret|token/i);
  });
});
