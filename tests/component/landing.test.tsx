import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  it("keeps the retail promise, occasion edit, and CTA visible", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A complete look, put together for you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Style my look" }),
    ).toHaveAttribute("href", "/build");

    [
      "For the interview",
      "For the presentation",
      "For the weekend",
    ].forEach((step) => {
      expect(screen.getByText(step)).toBeInTheDocument();
    });

  });
});
