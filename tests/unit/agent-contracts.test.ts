import { describe, expect, it } from "vitest";

import {
  AgentRequestSchema,
  AgentSuccessResponseSchema,
} from "@/lib/agent/contracts";
import type {
  Outfit,
  OutfitReference,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

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

function generatedOutfits(): Outfit[] {
  const result = generateOutfits(preferences);

  if (!result.ok) {
    throw new Error("The agent contract fixture requires verified outfits.");
  }

  return result.outfits;
}

function toReference(outfit: Outfit): OutfitReference {
  return {
    top: {
      productId: outfit.top.product.id,
      selectedSize: outfit.top.selectedSize,
    },
    bottom: {
      productId: outfit.bottom.product.id,
      selectedSize: outfit.bottom.selectedSize,
    },
    shoes: {
      productId: outfit.shoes.product.id,
      selectedSize: outfit.shoes.selectedSize,
    },
  };
}

describe("agent API contracts", () => {
  it("accepts only compact, unique catalogue references", () => {
    const outfits = generatedOutfits();
    const references = outfits.map(toReference);

    expect(
      AgentRequestSchema.safeParse({
        message: "Make the shoes cheaper",
        state: {
          preferences,
          outfits: references,
          selectedOutfit: references[0],
        },
      }).success,
    ).toBe(true);

    expect(
      AgentRequestSchema.safeParse({
        message: "Make the shoes cheaper",
        state: {
          preferences,
          outfits: [references[0], references[0]],
          selectedOutfit: references[0],
        },
      }).success,
    ).toBe(false);

    expect(
      AgentRequestSchema.safeParse({
        message: "Make the shoes cheaper",
        state: {
          preferences,
          outfits: references.slice(0, 2),
          selectedOutfit: references[2],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects presentation facts and oversized messages at the boundary", () => {
    const outfit = generatedOutfits()[0];
    const reference = toReference(outfit);

    expect(
      AgentRequestSchema.safeParse({
        message: "Replace the top",
        state: {
          preferences,
          outfits: [
            {
              ...reference,
              priceCents: 1,
              product: outfit.top.product,
            },
          ],
          selectedOutfit: null,
        },
      }).success,
    ).toBe(false);

    expect(
      AgentRequestSchema.safeParse({
        message: "x".repeat(281),
        state: {
          preferences,
          outfits: [reference],
          selectedOutfit: null,
        },
      }).success,
    ).toBe(false);
  });

  it("requires unique verified response outfits and consistent diagnostics", () => {
    const outfits = generatedOutfits();
    const baseResponse = {
      ok: true as const,
      requestId: "00000000-0000-4000-8000-000000000000",
      intent: { type: "HELP" as const },
      provider: {
        configured: "rules" as const,
        interpretedBy: "rules" as const,
        explainedBy: "template" as const,
        fallbackCode: null,
      },
      event: { type: "NO_CHANGE" as const, reason: "help" as const },
      assistantMessage: "Try one supported action.",
      state: {
        preferences,
        outfits,
        selectedOutfitId: null,
        diagnostics: null,
      },
    };

    expect(AgentSuccessResponseSchema.safeParse(baseResponse).success).toBe(
      true,
    );
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...baseResponse,
        state: {
          ...baseResponse.state,
          outfits: [outfits[0], outfits[0]],
        },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...baseResponse,
        state: {
          ...baseResponse.state,
          outfits: [],
        },
      }).success,
    ).toBe(false);

  });

  it("rejects impossible provider disclosures and event/state combinations", () => {
    const outfits = generatedOutfits();
    const response = {
      ok: true as const,
      requestId: "00000000-0000-4000-8000-000000000000",
      intent: { type: "SELECT_OUTFIT" as const, position: 2 as const },
      provider: {
        configured: "gemini" as const,
        interpretedBy: "gemini" as const,
        explainedBy: "template" as const,
        fallbackCode: null,
      },
      event: { type: "OUTFIT_SELECTED" as const, outfitIndex: 1 },
      assistantMessage: "Look two is selected.",
      state: {
        preferences,
        outfits,
        selectedOutfitId: outfits[1].id,
        diagnostics: null,
      },
    };

    expect(AgentSuccessResponseSchema.safeParse(response).success).toBe(true);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...response,
        provider: {
          ...response.provider,
          interpretedBy: "rules",
          fallbackCode: null,
        },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...response,
        event: { type: "CHECKOUT_REVIEW_READY", outfitIndex: 1 },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...response,
        state: { ...response.state, selectedOutfitId: outfits[0].id },
      }).success,
    ).toBe(false);

    const cheaperResponse = {
      ...response,
      intent: { type: "MAKE_CHEAPER" as const, category: "shoes" as const },
      event: {
        type: "ITEM_REPLACED" as const,
        category: "shoes" as const,
        outfitIndex: 0,
      },
      state: { ...response.state, selectedOutfitId: null },
    };

    expect(
      AgentSuccessResponseSchema.safeParse({
        ...cheaperResponse,
        event: { ...cheaperResponse.event, outfitIndex: 2 },
        state: { ...cheaperResponse.state, outfits: [outfits[0]] },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...cheaperResponse,
        event: { ...cheaperResponse.event, category: "top" },
      }).success,
    ).toBe(false);
  });

  it("rejects outfits that violate the response preferences", () => {
    const outfits = generatedOutfits();
    const baseResponse = {
      ok: true as const,
      requestId: "00000000-0000-4000-8000-000000000000",
      intent: { type: "HELP" as const },
      provider: {
        configured: "rules" as const,
        interpretedBy: "rules" as const,
        explainedBy: "template" as const,
        fallbackCode: null,
      },
      event: { type: "NO_CHANGE" as const, reason: "help" as const },
      assistantMessage: "Try one supported action.",
      state: {
        preferences,
        outfits,
        selectedOutfitId: null,
        diagnostics: null,
      },
    };

    expect(
      AgentSuccessResponseSchema.safeParse({
        ...baseResponse,
        state: {
          ...baseResponse.state,
          preferences: { ...preferences, budgetCents: 1 },
        },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...baseResponse,
        state: {
          ...baseResponse.state,
          preferences: { ...preferences, excludedColors: ["navy"] },
        },
      }).success,
    ).toBe(false);
    expect(
      AgentSuccessResponseSchema.safeParse({
        ...baseResponse,
        state: {
          ...baseResponse.state,
          preferences: { ...preferences, topSize: "XL" },
        },
      }).success,
    ).toBe(false);
  });
});
