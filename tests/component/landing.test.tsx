import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  it("keeps the core promise, journey, and CTA visible", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Complete outfits, built around you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Build my outfits" }),
    ).toHaveAttribute("href", "/build");

    [
      "1. Describe",
      "2. Review",
      "3. Approve",
    ].forEach((step) => {
      expect(
        screen.getByRole("heading", { level: 3, name: step }),
      ).toBeInTheDocument();
    });

  });
});
