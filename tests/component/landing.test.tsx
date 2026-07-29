import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  it("keeps the core promise, journey, and CTA visible", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Find your next complete outfit.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Build my outfits" }),
    ).toHaveAttribute("href", "/build");

    [
      "Describe",
      "Compare",
      "Approve",
    ].forEach((step) => {
      expect(screen.getByText(step)).toBeInTheDocument();
    });

  });
});
