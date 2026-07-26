import { describe, expect, it, vi } from "vitest";

import { orchestrateAgent } from "@/lib/agent/orchestrator";
import {
  AgentProviderError,
  type AgentProvider,
} from "@/lib/agent/providers/types";
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

const expensivePreferences: UserPreferences = {
  ...preferences,
  budgetCents: 20_000,
};

const expensiveReference: OutfitReference = {
  top: { productId: "top-08", selectedSize: "M" },
  bottom: { productId: "bottom-10", selectedSize: "M" },
  shoes: { productId: "shoes-08", selectedSize: "42" },
};

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

function generatedReferences(): OutfitReference[] {
  const generated = generateOutfits(preferences);

  if (!generated.ok) {
    throw new Error("The orchestrator fixture requires verified outfits.");
  }

  return generated.outfits.map(toReference);
}

function requestWith(
  message: string,
  overrides: Partial<{
    preferences: UserPreferences;
    outfits: OutfitReference[];
    selectedOutfit: OutfitReference | null;
  }> = {},
) {
  const outfits = overrides.outfits ?? generatedReferences();

  return {
    message,
    state: {
      preferences: overrides.preferences ?? preferences,
      outfits,
      selectedOutfit: overrides.selectedOutfit ?? null,
    },
  };
}

function fakeProvider(
  name: "gemini" | "ollama",
  result: unknown,
): AgentProvider {
  return {
    name,
    interpret: vi.fn().mockResolvedValue(result),
    explain: vi.fn().mockResolvedValue({ sentenceIds: ["verified"] }),
  };
}

const fixedRequestId = () => "00000000-0000-4000-8000-000000000000";

describe("controlled agent orchestrator", () => {
  it("supports the default cheaper-shoes suggestion against the first look", async () => {
    const response = await orchestrateAgent(
      requestWith("Replace the shoes with a cheaper option"),
      { requestId: fixedRequestId },
    );

    expect(response.intent).toMatchObject({
      type: "REPLACE_ITEM",
      category: "shoes",
      requireCheaper: true,
    });
    expect(response.event).toMatchObject({
      type: "ITEM_REPLACED",
      category: "shoes",
      outfitIndex: 0,
    });
  });

  it("does not silently apply an unrepresentable outfit-position target", async () => {
    const references = generatedReferences();
    const response = await orchestrateAgent(
      requestWith("Replace the shoes in outfit 2", {
        outfits: references,
      }),
      { requestId: fixedRequestId },
    );

    expect(response.intent).toMatchObject({ type: "UNSUPPORTED" });
    expect(response.event).toEqual({
      type: "NO_CHANGE",
      reason: "unsupported",
    });
    expect(response.state.outfits.map(toReference)).toEqual(references);
  });

  it("executes a cheaper-shoes request against canonical catalogue facts", async () => {
    const response = await orchestrateAgent(
      requestWith("Make the shoes cheaper", {
        preferences: expensivePreferences,
        outfits: [expensiveReference],
      }),
      { requestId: fixedRequestId },
    );

    expect(response.provider).toEqual({
      configured: "rules",
      interpretedBy: "rules",
      explainedBy: "template",
      fallbackCode: null,
    });
    expect(response.intent).toEqual({
      type: "MAKE_CHEAPER",
      category: "shoes",
    });
    expect(response.event).toEqual({
      type: "ITEM_REPLACED",
      category: "shoes",
      outfitIndex: 0,
    });
    expect(response.state.outfits[0].shoes.product.id).not.toBe("shoes-08");
    expect(response.state.outfits[0].top.product.id).toBe("top-08");
    expect(response.state.outfits[0].bottom.product.id).toBe("bottom-10");
    expect(response.state.outfits[0].totalCents).toBe(
      response.state.outfits[0].top.product.priceCents +
        response.state.outfits[0].bottom.product.priceCents +
        response.state.outfits[0].shoes.product.priceCents,
    );
    expect(response.state.selectedOutfitId).toBeNull();
  });

  it("falls back truthfully when an AI provider returns extra commerce fields", async () => {
    const provider = fakeProvider("gemini", {
      type: "EXCLUDE_COLOR",
      color: "white",
      productId: "top-01",
      approved: true,
    });
    const response = await orchestrateAgent(requestWith("Avoid white"), {
      requestId: fixedRequestId,
      providerResolution: {
        status: "ready",
        configured: "gemini",
        provider,
      },
    });

    expect(provider.interpret).toHaveBeenCalledOnce();
    expect(provider.explain).not.toHaveBeenCalled();
    expect(response.intent).toEqual({
      type: "EXCLUDE_COLOR",
      color: "white",
    });
    expect(response.provider).toEqual({
      configured: "gemini",
      interpretedBy: "rules",
      explainedBy: "template",
      fallbackCode: "INVALID_OUTPUT",
    });
    expect(response.state.preferences.excludedColors).toContain("white");
  });

  it("rejects a model-invented parameter through the semantic evidence guard", async () => {
    const provider = fakeProvider("ollama", {
      type: "CHANGE_STYLE",
      style: "relaxed",
    });
    const response = await orchestrateAgent(requestWith("Avoid white"), {
      requestId: fixedRequestId,
      providerResolution: {
        status: "ready",
        configured: "ollama",
        provider,
      },
    });

    expect(response.intent).toEqual({
      type: "EXCLUDE_COLOR",
      color: "white",
    });
    expect(response.provider.fallbackCode).toBe("SEMANTIC_MISMATCH");
    expect(response.provider.interpretedBy).toBe("rules");
  });

  it("falls back after a bounded provider timeout", async () => {
    const provider: AgentProvider = {
      name: "gemini",
      interpret: vi.fn().mockRejectedValue(
        new AgentProviderError("gemini", "TIMEOUT", "timed out"),
      ),
      explain: vi.fn().mockResolvedValue({ sentenceIds: ["verified"] }),
    };
    const response = await orchestrateAgent(requestWith("Help"), {
      requestId: fixedRequestId,
      providerResolution: {
        status: "ready",
        configured: "gemini",
        provider,
      },
    });

    expect(response.intent).toEqual({ type: "HELP" });
    expect(response.provider.fallbackCode).toBe("TIMEOUT");
    expect(response.event).toEqual({ type: "NO_CHANGE", reason: "help" });
  });

  it("reports missing AI configuration without pretending rules were Gemini", async () => {
    const response = await orchestrateAgent(requestWith("Help"), {
      requestId: fixedRequestId,
      providerResolution: {
        status: "unavailable",
        configured: "gemini",
        reason: "NOT_CONFIGURED",
        message: "Gemini is not configured.",
      },
    });

    expect(response.provider).toEqual({
      configured: "gemini",
      interpretedBy: "rules",
      explainedBy: "template",
      fallbackCode: "NOT_CONFIGURED",
    });
  });

  it("sends the provider a compact state summary without product facts", async () => {
    const provider = fakeProvider("gemini", { type: "HELP" });

    await orchestrateAgent(requestWith("Help"), {
      requestId: fixedRequestId,
      providerResolution: {
        status: "ready",
        configured: "gemini",
        provider,
      },
    });

    const providerInput = vi.mocked(provider.interpret).mock.calls[0][0];
    const serialized = JSON.stringify(providerInput.state);

    expect(providerInput.state).toMatchObject({
      budgetCents: 15_000,
      visibleOutfitCount: 3,
      selectedOutfitPosition: null,
    });
    expect(serialized).not.toContain("productId");
    expect(serialized).not.toContain("priceCents");
    expect(serialized).not.toContain("stockBySize");
  });

  it("retains a valid lower budget and diagnostics when it yields no outfits", async () => {
    const response = await orchestrateAgent(
      requestWith("Lower the budget to $20"),
      { requestId: fixedRequestId },
    );

    expect(response.event).toEqual({
      type: "OUTFITS_UPDATED",
      reason: "change_budget",
    });
    expect(response.state.preferences.budgetCents).toBe(2_000);
    expect(response.state.outfits).toEqual([]);
    expect(response.state.selectedOutfitId).toBeNull();
    expect(response.state.diagnostics?.code).toBe(
      "NO_OUTFIT_WITHIN_BUDGET",
    );
  });

  it("selects only a visible outfit and prepares review without payment", async () => {
    const selected = await orchestrateAgent(requestWith("Select outfit 2"), {
      requestId: fixedRequestId,
    });
    const references = selected.state.outfits.map(toReference);
    const review = await orchestrateAgent(
      requestWith("Proceed to checkout", {
        outfits: references,
        selectedOutfit: references[1],
      }),
      { requestId: fixedRequestId },
    );

    expect(selected.event).toEqual({
      type: "OUTFIT_SELECTED",
      outfitIndex: 1,
    });
    expect(selected.state.selectedOutfitId).toBe(
      selected.state.outfits[1].id,
    );
    expect(review.event).toEqual({
      type: "CHECKOUT_REVIEW_READY",
      outfitIndex: 1,
    });
    expect(review.assistantMessage).toContain(
      "No payment session has been created",
    );
    expect(review).not.toHaveProperty("payment");
    expect(review).not.toHaveProperty("checkoutUrl");
  });

  it("requires a selection before checkout review", async () => {
    const response = await orchestrateAgent(
      requestWith("Proceed to checkout"),
      { requestId: fixedRequestId },
    );

    expect(response.event).toEqual({
      type: "NO_CHANGE",
      reason: "selection_required",
    });
    expect(response.assistantMessage).toContain(
      "No payment session was created",
    );
  });

  it("rejects tampered catalogue references before provider execution", async () => {
    const provider = fakeProvider("gemini", { type: "HELP" });
    const references = generatedReferences();
    references[0] = {
      ...references[0],
      top: { ...references[0].top, productId: "top-99" },
    };

    await expect(
      orchestrateAgent(requestWith("Help", { outfits: references }), {
        requestId: fixedRequestId,
        providerResolution: {
          status: "ready",
          configured: "gemini",
          provider,
        },
      }),
    ).rejects.toMatchObject({
      code: "AGENT_STATE_INVALID",
    });
    expect(provider.interpret).not.toHaveBeenCalled();
  });
});
