import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  it("keeps the core promise, journey, and CTA visible", () => {
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

  });
});
