import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CheckoutResult,
  type CheckoutResultStatus,
} from "@/components/checkout/checkout-result";

describe("CheckoutResult", () => {
  it.each([
    ["approved", "Your outfit order is confirmed."],
    ["declined", "The order was not placed."],
    ["awaiting_payment", "The hosted payment is waiting for you."],
    ["pending", "The provider is still processing."],
    ["expired", "This payment session has ended."],
    ["reconciliation_required", "Fitora cannot safely confirm the outcome yet."],
    ["mock_success", "The checkout simulation worked."],
  ] satisfies ReadonlyArray<readonly [CheckoutResultStatus, string]>) (
    "renders the %s result with a recovery action",
    (status, title) => {
      render(<CheckoutResult result={{ status }} />);

      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Checkout result actions" })).toBeInTheDocument();
      expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    },
  );

  it("renders only the provided sanitized summary fields", () => {
    render(
      <CheckoutResult
        result={{
          status: "approved",
          provider: "prava",
          orderReference: "FITORA-1234567890ABCDEF",
          totalCents: 12_300,
          currency: "USD",
          completedAt: "2026-07-26T12:15:00.000Z",
          itemCount: 3,
        }}
      />,
    );

    expect(screen.getByText("Prava sandbox")).toBeInTheDocument();
    expect(screen.getByText("FITORA-1234567890ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("$123.00")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Jul 26, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Payment credentials, card data, email/i)).toBeInTheDocument();
  });

  it("labels mock success as a simulation and warns against duplicate pending payment", () => {
    const view = render(
      <CheckoutResult result={{ status: "mock_success", provider: "mock" }} />,
    );

    expect(screen.getByText(/this was a simulation and no real charge/i)).toBeInTheDocument();
    view.rerender(<CheckoutResult result={{ status: "pending", provider: "prava" }} />);
    expect(screen.getByText(/Do not submit a second payment/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check status again" })).toHaveAttribute(
      "href",
      "/checkout/result",
    );
    view.rerender(<CheckoutResult result={{ status: "declined", provider: "mock" }} />);
    expect(
      screen.getByRole("link", { name: "Start a fresh checkout" }),
    ).toHaveAttribute("href", "/build");
    view.rerender(
      <CheckoutResult
        result={{ status: "awaiting_payment", provider: "mock" }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Return to mock payment" }),
    ).toHaveAttribute("href", "/checkout/mock");
  });
});
