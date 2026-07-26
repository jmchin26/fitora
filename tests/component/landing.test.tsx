import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the core promise, journey, CTA, and active modes visible", () => {
    vi.stubEnv("AI_PROVIDER", "rules");
    vi.stubEnv("PAYMENT_PROVIDER", "mock");

    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Style that fits the moment.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Build my outfit" }),
    ).toHaveAttribute("href", "/build");

    [
      "Tell us the moment",
      "Review complete looks",
      "Approve and pay",
    ].forEach((step) => {
      expect(
        screen.getByRole("heading", { level: 3, name: step }),
      ).toBeInTheDocument();
    });

    const activeModes = screen.getByRole("group", {
      name: "Active provider modes",
    });

    expect(within(activeModes).getByText("Rules fallback")).toBeInTheDocument();
    expect(
      within(activeModes).getByText("Mock payment mode"),
    ).toBeInTheDocument();
  });
});
