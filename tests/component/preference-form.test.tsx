import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PREFERENCE_DRAFT,
  PreferenceForm,
  type PreferenceDraft,
} from "@/components/build/preference-form";
import type { UserPreferences } from "@/lib/catalogue/schemas";

function PreferenceFormHarness({
  onValidSubmit = vi.fn(),
}: {
  onValidSubmit?: (preferences: UserPreferences) => void;
}) {
  const [draft, setDraft] = useState<PreferenceDraft>({
    ...DEFAULT_PREFERENCE_DRAFT,
    preferredColors: [...DEFAULT_PREFERENCE_DRAFT.preferredColors],
    excludedColors: [...DEFAULT_PREFERENCE_DRAFT.excludedColors],
  });

  return (
    <PreferenceForm
      draft={draft}
      isSubmitting={false}
      onDraftChange={setDraft}
      onValidSubmit={onValidSubmit}
    />
  );
}

describe("PreferenceForm", () => {
  it("exposes every required preference through labelled controls", () => {
    render(<PreferenceFormHarness />);

    const occasionGroup = screen.getByRole("group", { name: "Occasion" });
    const styleGroup = screen.getByRole("group", {
      name: "Style direction",
    });
    const sizeGroup = screen.getByRole("group", { name: "Your sizes" });

    expect(
      within(occasionGroup).getByRole("radio", { name: "Presentation" }),
    ).toBeChecked();
    expect(
      within(styleGroup).getByRole("radio", { name: "Smart casual" }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Total outfit budget" }),
    ).toHaveValue("150.00");
    expect(within(sizeGroup).getByRole("combobox", { name: "Top" })).toHaveValue(
      "M",
    );
    expect(
      within(sizeGroup).getByRole("combobox", { name: "Bottom" }),
    ).toHaveValue("M");
    expect(
      within(sizeGroup).getByRole("combobox", { name: /Shoes/ }),
    ).toHaveValue("42");
    expect(
      screen.getByRole("group", {
        name: "Preferred colours (optional)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: "Colours to avoid (optional)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Build outfit options" }),
    ).toBeEnabled();

    const avoidedColours = screen.getByRole("group", {
      name: "Colours to avoid (optional)",
    });
    const burgundyChoice = within(avoidedColours)
      .getByRole("checkbox", { name: "Burgundy" })
      .closest("label");
    expect(burgundyChoice).toHaveClass("overflow-hidden", "text-xs");
    expect(burgundyChoice?.parentElement).toHaveClass(
      "sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(5.25rem,1.15fr)]",
    );
  });

  it("shows an invalid budget error and submits after the value is corrected", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();

    render(<PreferenceFormHarness onValidSubmit={onValidSubmit} />);

    const budgetInput = screen.getByRole("textbox", {
      name: "Total outfit budget",
    });

    await user.clear(budgetInput);
    await user.type(budgetInput, "125.999");
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      screen.getByText(/up to two decimal places/i),
    ).toBeInTheDocument();
    expect(budgetInput).toHaveAttribute("aria-invalid", "true");
    expect(onValidSubmit).not.toHaveBeenCalled();

    await user.clear(budgetInput);
    await user.type(budgetInput, "150.00");
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(onValidSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ budgetCents: 15_000 }),
    );
    expect(budgetInput).toHaveAttribute("aria-invalid", "false");
  });

  it("blocks a colour conflict and recovers after the avoided colour is removed", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();

    render(<PreferenceFormHarness onValidSubmit={onValidSubmit} />);

    const avoidedColours = screen.getByRole("group", {
      name: "Colours to avoid (optional)",
    });
    const avoidedNavy = within(avoidedColours).getByRole("checkbox", {
      name: "Navy",
    });

    await user.click(avoidedNavy);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(
      screen.getByText(/cannot be both preferred and excluded/i),
    ).toBeInTheDocument();
    expect(onValidSubmit).not.toHaveBeenCalled();

    await user.click(avoidedNavy);
    await user.click(
      screen.getByRole("button", { name: "Build outfit options" }),
    );

    expect(onValidSubmit).toHaveBeenCalledOnce();
  });
});
