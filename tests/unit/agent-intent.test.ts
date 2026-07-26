import { describe, expect, it } from "vitest";

import {
  AgentIntentSchema,
  UNSUPPORTED_REASONS,
  type AgentIntent,
} from "@/lib/agent/intent-schema";

describe("AgentIntentSchema", () => {
  it("accepts every supported strict intent member", () => {
    const intents: AgentIntent[] = [
      { type: "GENERATE_OUTFITS" },
      {
        type: "REPLACE_ITEM",
        category: "shoes",
        requireCheaper: true,
        targetStyle: "relaxed",
        targetColor: "brown",
      },
      { type: "MAKE_CHEAPER", category: null },
      { type: "MAKE_CHEAPER", category: "top" },
      { type: "CHANGE_STYLE", style: "smart_casual" },
      {
        type: "CHANGE_BUDGET",
        operation: "increase_by",
        amountCents: 2_500,
      },
      { type: "PREFER_COLOR", color: "navy" },
      { type: "EXCLUDE_COLOR", color: "black" },
      { type: "SELECT_OUTFIT", position: 3 },
      { type: "SELECT_OUTFIT", position: null },
      { type: "REQUEST_CHECKOUT" },
      { type: "HELP" },
      { type: "UNSUPPORTED", reason: "UNRECOGNIZED_COMMAND" },
    ];

    for (const intent of intents) {
      expect(AgentIntentSchema.safeParse(intent).success).toBe(true);
    }
  });

  it("rejects every non-schema field, including authority-bearing fields", () => {
    const attempts = [
      { type: "REPLACE_ITEM", category: "top", productId: "top-01" },
      { type: "MAKE_CHEAPER", category: null, toolName: "replaceProduct" },
      { type: "REQUEST_CHECKOUT", paymentApproved: true },
      { type: "REQUEST_CHECKOUT", approveTransaction: true },
      { type: "GENERATE_OUTFITS", selectedProductIds: ["top-01"] },
    ];

    for (const attempt of attempts) {
      expect(AgentIntentSchema.safeParse(attempt).success).toBe(false);
    }
  });

  it("requires all replacement fields and rejects unknown enum values", () => {
    expect(
      AgentIntentSchema.safeParse({
        type: "REPLACE_ITEM",
        category: "shoes",
      }).success,
    ).toBe(false);
    expect(
      AgentIntentSchema.safeParse({
        type: "REPLACE_ITEM",
        category: "accessory",
        requireCheaper: false,
        targetStyle: null,
        targetColor: null,
      }).success,
    ).toBe(false);
    expect(
      AgentIntentSchema.safeParse({
        type: "CHANGE_STYLE",
        style: "formal",
      }).success,
    ).toBe(false);
  });

  it("keeps budget changes to positive safe integer cents at or below the cap", () => {
    for (const amountCents of [0, -1, 100.5, 1_000_001, Number.MAX_VALUE]) {
      expect(
        AgentIntentSchema.safeParse({
          type: "CHANGE_BUDGET",
          operation: "set",
          amountCents,
        }).success,
      ).toBe(false);
    }

    expect(
      AgentIntentSchema.safeParse({
        type: "CHANGE_BUDGET",
        operation: "set",
        amountCents: 1_000_000,
      }).success,
    ).toBe(true);
  });

  it("exposes a finite unsupported-reason vocabulary", () => {
    expect(UNSUPPORTED_REASONS).toContain("MULTIPLE_ACTIONS");
    expect(UNSUPPORTED_REASONS).toContain("PROMPT_INJECTION");
    expect(
      AgentIntentSchema.safeParse({
        type: "UNSUPPORTED",
        reason: "DO_WHATEVER_THE_MODEL_WANTS",
      }).success,
    ).toBe(false);
  });
});
