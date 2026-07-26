import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuildExperience } from "@/components/build/build-experience";
import {
  FITORA_BUILD_STATE_KEY,
  toSafeSelectedOutfit,
} from "@/components/build/storage";
import type { UserPreferences } from "@/lib/catalogue/schemas";
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

function successfulPayload() {
  const result = generateOutfits(standardPreferences);

  if (!result.ok) {
    throw new Error("The standard preferences must produce test outfits.");
  }

  return result;
}

function successfulPayloadAtBudget(budgetCents: number) {
  const result = generateOutfits({ ...standardPreferences, budgetCents });

  if (!result.ok) {
    throw new Error(`Budget ${budgetCents} must produce test outfits.`);
  }

  return result;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("BuildExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders three schema-verified outfits and keeps exactly one selection", async () => {
    const user = userEvent.setup();
    const payload = successfulPayload();
    const fetchMock = mockFetchOnce(payload);

    render(<BuildExperience />);

    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      await screen.findByText(
        "Three verified outfits are ready. Choose one look.",
      ),
    ).toBeInTheDocument();

    const choices = screen.getAllByRole("radio", {
      name: /Select verified outfit/,
    });

    expect(choices).toHaveLength(3);
    choices.forEach((choice) => expect(choice).not.toBeChecked());

    await user.click(choices[1]);

    expect(choices[1]).toBeChecked();
    expect(choices[0]).not.toBeChecked();
    expect(choices[2]).not.toBeChecked();
    expect(screen.getByText("Outfit selected")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outfits/generate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(standardPreferences),
      }),
    );
  });

  it.each([
    [11_100, "111.00", "One", 1],
    [11_200, "112.00", "Two", 2],
  ] as const)(
    "accepts up-to-three success responses at a %i-cent budget",
    async (budgetCents, budgetUsd, countLabel, expectedCount) => {
      const user = userEvent.setup();
      const payload = successfulPayloadAtBudget(budgetCents);

      expect(payload.outfits).toHaveLength(expectedCount);
      mockFetchOnce(payload);
      render(<BuildExperience />);

      const budgetInput = screen.getByRole("textbox", {
        name: "Total outfit budget",
      });
      await user.clear(budgetInput);
      await user.type(budgetInput, budgetUsd);
      await user.click(
        screen.getByRole("button", { name: "Build outfit options" }),
      );

      expect(
        await screen.findByText(
          `${countLabel} verified ${expectedCount === 1 ? "outfit is" : "outfits are"} ready. Choose one look.`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("radio", { name: /Select verified outfit/ }),
      ).toHaveLength(expectedCount);
    },
  );

  it("rejects duplicate outfit IDs and combinations in a success response", async () => {
    const user = userEvent.setup();
    const payload = successfulPayload();
    mockFetchOnce({
      ok: true,
      outfits: [payload.outfits[0], payload.outfits[0]],
    });

    render(<BuildExperience />);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("unexpected catalogue response");
    expect(
      screen.queryByRole("radio", { name: /Select verified outfit/ }),
    ).not.toBeInTheDocument();
  });

  it("renders structured no-result diagnostics and keeps the form available", async () => {
    const user = userEvent.setup();
    mockFetchOnce(
      {
        error: {
          code: "NO_OUTFIT_WITHIN_BUDGET",
          message: "No complete outfit fits this budget.",
        },
        diagnostics: {
          code: "NO_OUTFIT_WITHIN_BUDGET",
          minimumAchievableTotalCents: 8_900,
          constrainedCategories: ["shoes"],
          suggestions: [
            "Raise your budget to at least $89.00 for the least expensive complete outfit.",
          ],
        },
      },
      422,
    );

    render(<BuildExperience />);

    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "No complete outfit fits this budget.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/least expensive eligible complete outfit is currently/i),
    ).toHaveTextContent("$89.00");
    expect(screen.getByText(/Tightest category:/)).toHaveTextContent("shoes");
    expect(
      screen.getByText(/Raise your budget to at least \$89\.00/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Build outfit options" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("radio", { name: /Select verified outfit/ }),
    ).not.toBeInTheDocument();
  });

  it("does not mislabel malformed or non-422 diagnostics as no results", async () => {
    const user = userEvent.setup();
    mockFetchOnce(
      {
        error: {
          code: "NO_OUTFIT_WITHIN_BUDGET",
          message: "Internal catalogue failure.",
        },
        diagnostics: {
          code: "NO_OUTFIT_WITHIN_BUDGET",
          minimumAchievableTotalCents: 8_900,
          constrainedCategories: ["shoes"],
          suggestions: ["Raise the budget."],
        },
      },
      500,
    );

    render(<BuildExperience />);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "We could not build this edit.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No verified match yet"),
    ).not.toBeInTheDocument();
  });

  it("discards an in-flight response after the user changes a preference", async () => {
    const user = userEvent.setup();
    const payload = successfulPayload();
    let resolveFetch: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingResponse));
    render(<BuildExperience />);

    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );
    expect(
      screen.getByRole("button", { name: /Building outfit options/ }),
    ).toBeDisabled();

    const budgetInput = screen.getByRole("textbox", {
      name: "Total outfit budget",
    });
    await user.clear(budgetInput);
    await user.type(budgetInput, "140.00");

    expect(
      screen.getByText("Ready to build up to three verified outfits."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Build outfit options" }),
    ).toBeEnabled();

    await act(async () => {
      resolveFetch?.(jsonResponse(payload));
      await pendingResponse;
      await Promise.resolve();
    });

    expect(
      screen.queryByText(
        "Three verified outfits are ready. Choose one look.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Select verified outfit/ }),
    ).not.toBeInTheDocument();
  });

  it("restores safe preferences and a prior selection only after server verification", async () => {
    const user = userEvent.setup();
    const payload = successfulPayload();
    const priorSelection = toSafeSelectedOutfit(payload.outfits[1]);

    window.localStorage.setItem(
      FITORA_BUILD_STATE_KEY,
      JSON.stringify({
        version: 1,
        preferences: standardPreferences,
        selectedOutfit: priorSelection,
      }),
    );
    mockFetchOnce(payload);

    render(<BuildExperience />);

    expect(
      await screen.findByText(
        /Saved preferences restored\. Build again to verify/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Select verified outfit/ }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    const choices = await screen.findAllByRole("radio", {
      name: /Select verified outfit/,
    });

    expect(choices).toHaveLength(3);
    expect(choices[1]).toBeChecked();
    expect(screen.getByText("Outfit selected")).toBeInTheDocument();
  });

  it("describes a selection as session-only when browser storage rejects writes", async () => {
    const user = userEvent.setup();
    mockFetchOnce(successfulPayload());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });

    render(<BuildExperience />);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    const choices = await screen.findAllByRole("radio", {
      name: /Select verified outfit/,
    });
    await user.click(choices[0]);

    expect(screen.getByRole("status")).toHaveTextContent(
      "selected for this session",
    );
    expect(screen.getByText(/current browser session only/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved safely on this device/i)).not.toBeInTheDocument();
  });

  it("drops unverified stored data and falls back to the demo defaults", async () => {
    window.localStorage.setItem(
      FITORA_BUILD_STATE_KEY,
      JSON.stringify({
        version: 1,
        preferences: { ...standardPreferences, budgetCents: "tampered" },
        selectedOutfit: null,
      }),
    );

    render(
      <StrictMode>
        <BuildExperience />
      </StrictMode>,
    );

    expect(
      await screen.findByText(/Saved preferences could not be verified/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Total outfit budget" }),
    ).toHaveValue("150.00");
    expect(window.localStorage.getItem(FITORA_BUILD_STATE_KEY)).toBeNull();
  });
});
