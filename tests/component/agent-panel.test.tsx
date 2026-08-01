import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentPanel } from "@/components/agent/agent-panel";
import { BuildExperience } from "@/components/build/build-experience";
import { FITORA_BUILD_STATE_KEY } from "@/components/build/storage";
import type { AgentSuccessResponse } from "@/lib/agent/contracts";
import type {
  Outfit,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

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

function verifiedOutfits(
  preferences: UserPreferences = standardPreferences,
): Outfit[] {
  const result = generateOutfits(preferences);

  if (!result.ok) {
    throw new Error("Test preferences must produce verified outfits.");
  }

  return result.outfits;
}

function outfitReference(outfit: Outfit) {
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

function agentResponse(
  overrides: Partial<AgentSuccessResponse> = {},
): AgentSuccessResponse {
  return {
    ok: true,
    requestId: "8dbf721f-2744-4b06-83b1-f9f622ca9e1c",
    intent: {
      type: "MAKE_CHEAPER",
      category: "shoes",
    },
    provider: {
      configured: "rules",
      interpretedBy: "rules",
      explainedBy: "template",
      fallbackCode: null,
    },
    event: {
      type: "ITEM_REPLACED",
      category: "shoes",
      outfitIndex: 0,
    },
    assistantMessage:
      "I verified a cheaper shoe option and recalculated the total.",
    state: {
      preferences: standardPreferences,
      outfits: verifiedOutfits(),
      selectedOutfitId: null,
      diagnostics: null,
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AgentPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("offers accessible one-tap revisions and enforces the 280 character limit", () => {
    render(
      <AgentPanel
        onVerifiedResponse={vi.fn()}
        outfits={verifiedOutfits()}
        preferences={standardPreferences}
        selectedOutfitId={null}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Replace the shoes with a cheaper option",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Make this outfit more relaxed" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Avoid white" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Use more navy" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Lower the budget to $130" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: "What would you change?" }),
    ).toHaveAttribute("maxlength", "280");
  });

  it("sends only the message, preferences, outfit references, and selected reference", async () => {
    const user = userEvent.setup();
    const outfits = verifiedOutfits();
    const onVerifiedResponse = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(agentResponse()));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AgentPanel
        onVerifiedResponse={onVerifiedResponse}
        outfits={outfits}
        preferences={standardPreferences}
        selectedOutfitId={outfits[1].id}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Replace the shoes with a cheaper option",
      }),
    );

    await waitFor(() => expect(onVerifiedResponse).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;

    expect(body).toEqual({
      message: "Replace the shoes with a cheaper option",
      state: {
        preferences: standardPreferences,
        outfits: outfits.map(outfitReference),
        selectedOutfit: outfitReference(outfits[1]),
      },
    });
    expect(JSON.stringify(body)).not.toContain(outfits[0].top.product.name);
    expect(JSON.stringify(body)).not.toContain("priceCents");
    expect(JSON.stringify(body)).not.toContain("stockBySize");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects malformed success bodies without changing verified state", async () => {
    const user = userEvent.setup();
    const onVerifiedResponse = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...agentResponse(),
          state: {
            ...agentResponse().state,
            selectedOutfitId: "invented-outfit",
          },
        }),
      ),
    );

    render(
      <AgentPanel
        onVerifiedResponse={onVerifiedResponse}
        outfits={verifiedOutfits()}
        preferences={standardPreferences}
        selectedOutfitId={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Avoid white" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong while updating your look",
    );
    expect(onVerifiedResponse).not.toHaveBeenCalled();
  });

  it("aborts and discards an in-flight response when its verified context changes", async () => {
    const user = userEvent.setup();
    const outfits = verifiedOutfits();
    const onVerifiedResponse = vi.fn();
    let resolveRequest: ((response: Response) => void) | undefined;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingRequest);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AgentPanel
        onVerifiedResponse={onVerifiedResponse}
        outfits={outfits}
        preferences={standardPreferences}
        selectedOutfitId={null}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Make this outfit more relaxed" }),
    );
    const requestSignal = (fetchMock.mock.calls[0][1] as RequestInit)
      .signal as AbortSignal;

    rerender(
      <AgentPanel
        onVerifiedResponse={onVerifiedResponse}
        outfits={outfits}
        preferences={standardPreferences}
        selectedOutfitId={outfits[0].id}
      />,
    );

    expect(requestSignal.aborted).toBe(true);

    await act(async () => {
      resolveRequest?.(jsonResponse(agentResponse()));
      await pendingRequest;
      await Promise.resolve();
    });

    expect(onVerifiedResponse).not.toHaveBeenCalled();
  });

  it("shows the actual provider path and makes checkout review non-transactional", async () => {
    const user = userEvent.setup();
    const outfits = verifiedOutfits();
    const checkoutResponse = agentResponse({
      intent: { type: "REQUEST_CHECKOUT" },
      provider: {
        configured: "gemini",
        interpretedBy: "rules",
        explainedBy: "template",
        fallbackCode: "TIMEOUT",
      },
      event: {
        type: "CHECKOUT_REVIEW_READY",
        outfitIndex: 0,
      },
      assistantMessage:
        "The selected outfit is ready for checkout review. No payment session was created.",
      state: {
        preferences: standardPreferences,
        outfits,
        selectedOutfitId: outfits[0].id,
        diagnostics: null,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(checkoutResponse)),
    );

    render(
      <AgentPanel
        onVerifiedResponse={vi.fn()}
        outfits={outfits}
        preferences={standardPreferences}
        selectedOutfitId={outfits[0].id}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "What would you change?",
    });
    await user.type(input, "Take me to checkout");
    await user.click(screen.getByRole("button", { name: "Apply change" }));

    expect(
      await screen.findByText(
        "Checkout review is ready. No payment session was created.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Styling mode: Rules fallback")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay|checkout/i })).not.toBeInTheDocument();
  });

  it("applies an agent selection as the single visible and safely persisted choice", async () => {
    const user = userEvent.setup();
    const outfits = verifiedOutfits();
    const selectionResponse = agentResponse({
      intent: { type: "SELECT_OUTFIT", position: 2 },
      event: { type: "OUTFIT_SELECTED", outfitIndex: 1 },
      assistantMessage:
        "Look 02 is selected. Price and stock will be checked again before checkout.",
      state: {
        preferences: standardPreferences,
        outfits,
        selectedOutfitId: outfits[1].id,
        diagnostics: null,
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ ok: true, outfits }))
        .mockResolvedValueOnce(jsonResponse(selectionResponse)),
    );

    render(<BuildExperience />);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );
    await screen.findByRole("heading", { name: "Adjust your look" });

    const agentInput = screen.getByRole("textbox", {
      name: "What would you change?",
    });
    await user.type(agentInput, "Select outfit 2");
    await user.click(screen.getByRole("button", { name: "Apply change" }));

    const choices = await screen.findAllByRole("radio", {
      name: /Select outfit/,
    });
    expect(choices[1]).toBeChecked();
    expect(choices[0]).not.toBeChecked();
    expect(choices[2]).not.toBeChecked();

    const persisted = JSON.parse(
      String(window.localStorage.getItem(FITORA_BUILD_STATE_KEY)),
    ) as {
      selectedOutfit: {
        id: string;
        reference: ReturnType<typeof outfitReference>;
      };
    };
    expect(persisted.selectedOutfit).toEqual({
      id: outfits[1].id,
      reference: outfitReference(outfits[1]),
    });
  });

  it("syncs agent preference and no-result changes without marking the draft stale or persisting chat", async () => {
    const user = userEvent.setup();
    const initialOutfits = verifiedOutfits();
    const lowerBudgetPreferences = {
      ...standardPreferences,
      budgetCents: 5_000,
    };
    const noResultsResponse = agentResponse({
      intent: {
        type: "CHANGE_BUDGET",
        operation: "set",
        amountCents: 5_000,
      },
      event: {
        type: "OUTFITS_UPDATED",
        reason: "change_budget",
      },
      assistantMessage: "No complete outfit fits the updated $50.00 budget.",
      state: {
        preferences: lowerBudgetPreferences,
        outfits: [],
        selectedOutfitId: null,
        diagnostics: {
          code: "NO_OUTFIT_WITHIN_BUDGET",
          minimumAchievableTotalCents: 8_900,
          constrainedCategories: ["shoes"],
          suggestions: ["Raise the budget to at least $89.00."],
        },
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, outfits: initialOutfits }),
      )
      .mockResolvedValueOnce(jsonResponse(noResultsResponse));
    vi.stubGlobal("fetch", fetchMock);

    render(<BuildExperience />);

    expect(
      screen.queryByRole("heading", { name: "Adjust your look" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Adjust your look" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Lower the budget to $130" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "No complete outfit fits the updated $50.00 budget.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Total outfit budget" }),
    ).toHaveValue("50.00");
    expect(
      screen.queryByText(/reflect your last submitted preferences/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Adjust your look" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What would you change?" }),
    ).toBeDisabled();

    const persisted = window.localStorage.getItem(FITORA_BUILD_STATE_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(String(persisted))).toEqual({
      version: 1,
      preferences: lowerBudgetPreferences,
      selectedOutfit: null,
    });
    expect(String(persisted)).not.toContain("assistantMessage");
    expect(String(persisted)).not.toContain("Lower the budget");
  });
});
