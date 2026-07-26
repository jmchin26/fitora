import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/agent/route";
import {
  AgentApiErrorSchema,
  AgentSuccessResponseSchema,
} from "@/lib/agent/contracts";
import type {
  Outfit,
  OutfitReference,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

const originalAiProvider = process.env.AI_PROVIDER;

const standardPreferences: UserPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

function outfitReference(outfit: Outfit): OutfitReference {
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

function verifiedOutfitReferences(): OutfitReference[] {
  const generated = generateOutfits(standardPreferences);

  if (!generated.ok) {
    throw new Error("The standard agent route fixture must generate outfits.");
  }

  return generated.outfits.map(outfitReference);
}

function agentBody(
  message: string,
  options: {
    outfits?: OutfitReference[];
    selectedOutfit?: OutfitReference | null;
  } = {},
) {
  const outfits = options.outfits ?? verifiedOutfitReferences();

  return {
    message,
    state: {
      preferences: standardPreferences,
      outfits,
      selectedOutfit: options.selectedOutfit ?? null,
    },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(): Request {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"message":',
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

beforeEach(() => {
  process.env.AI_PROVIDER = "rules";
});

afterEach(() => {
  if (originalAiProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalAiProvider;
  }

  vi.unstubAllGlobals();
});

describe("POST /api/agent", () => {
  it("returns a schema-valid response from the rules provider", async () => {
    const response = await POST(
      jsonRequest(agentBody("Change the style to relaxed")),
    );
    const body: unknown = await response.json();
    const parsed = AgentSuccessResponseSchema.safeParse(body);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expectNoStore(response);

    if (parsed.success) {
      expect(parsed.data.provider).toEqual({
        configured: "rules",
        interpretedBy: "rules",
        explainedBy: "template",
        fallbackCode: null,
      });
      expect(parsed.data.intent).toEqual({
        type: "CHANGE_STYLE",
        style: "relaxed",
      });
      expect(parsed.data.state.preferences.style).toBe("relaxed");
    }
  });

  it("rejects malformed JSON with a sanitized, non-cacheable error", async () => {
    const response = await POST(malformedJsonRequest());
    const body: unknown = await response.json();
    const parsed = AgentApiErrorSchema.safeParse(body);

    expect(response.status).toBe(400);
    expect(parsed.success).toBe(true);
    expectNoStore(response);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("INVALID_JSON");
      expect(parsed.data.error).not.toHaveProperty("fields");
    }
  });

  it("returns flattened fields for an invalid agent request", async () => {
    const response = await POST(jsonRequest(agentBody("   ")));
    const body: unknown = await response.json();
    const parsed = AgentApiErrorSchema.safeParse(body);

    expect(response.status).toBe(400);
    expect(parsed.success).toBe(true);
    expectNoStore(response);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("INVALID_AGENT_REQUEST");
      expect(parsed.data.error.fields?.message).toBeDefined();
    }
  });

  it("rejects a syntactically valid but unknown product reference", async () => {
    const outfits = verifiedOutfitReferences();
    const tamperedOutfits = [
      {
        ...outfits[0],
        top: {
          ...outfits[0].top,
          productId: "top-99",
        },
      },
      ...outfits.slice(1),
    ];
    const response = await POST(
      jsonRequest(
        agentBody("Help", {
          outfits: tamperedOutfits,
        }),
      ),
    );
    const body: unknown = await response.json();
    const parsed = AgentApiErrorSchema.safeParse(body);

    expect(response.status).toBe(409);
    expect(parsed.success).toBe(true);
    expectNoStore(response);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("AGENT_STATE_INVALID");
      expect(parsed.data.error).not.toHaveProperty("fields");
      expect(JSON.stringify(parsed.data)).not.toMatch(
        /diagnostics|stockBySize|merchantId|provider/i,
      );
    }
  });

  it("prepares checkout review without creating a payment session", async () => {
    const paymentFetch = vi.fn();
    vi.stubGlobal("fetch", paymentFetch);
    const outfits = verifiedOutfitReferences();
    const response = await POST(
      jsonRequest(
        agentBody("Proceed to checkout", {
          outfits,
          selectedOutfit: outfits[0],
        }),
      ),
    );
    const body: unknown = await response.json();
    const parsed = AgentSuccessResponseSchema.safeParse(body);

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);
    expectNoStore(response);
    expect(paymentFetch).not.toHaveBeenCalled();

    if (parsed.success) {
      expect(parsed.data.intent.type).toBe("REQUEST_CHECKOUT");
      expect(parsed.data.event).toEqual({
        type: "CHECKOUT_REVIEW_READY",
        outfitIndex: 0,
      });
      expect(parsed.data.assistantMessage).toMatch(
        /no payment session has been created/i,
      );
    }
  });
});
