import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";

describe("Fitora landing page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the core promise, journey, CTA, and active modes visible", () => {
    vi.stubEnv("NODE_ENV", "test");
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

  it("shows an explicit invalid payment state instead of unready Prava", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "rules");
    vi.stubEnv("PAYMENT_PROVIDER", "prava");
    vi.stubEnv(
      "CHECKOUT_SIGNING_SECRET",
      "landing-test-signing-secret-123456789012345",
    );
    vi.stubEnv("PRAVA_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");

    render(<Home />);

    const activeModes = screen.getByRole("group", {
      name: "Active provider modes",
    });
    const invalidPayment = within(activeModes).getByText(
      "Invalid payment configuration",
    );

    expect(invalidPayment).toBeInTheDocument();
    expect(invalidPayment.closest("[data-readiness]")).toHaveAttribute(
      "data-readiness",
      "invalid",
    );
    expect(
      within(activeModes).queryByText("Prava sandbox"),
    ).not.toBeInTheDocument();
    expect(
      within(activeModes)
        .getByText("Rules fallback")
        .closest("[data-readiness]"),
    ).toHaveAttribute("data-readiness", "ready");
  });

  it("surfaces a production mock configuration without a signing secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "rules");
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("CHECKOUT_SIGNING_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fitora.example");
    vi.stubEnv("DEMO_MERCHANT_URL", "https://merchant.fitora.example");

    render(<Home />);

    const activeModes = screen.getByRole("group", {
      name: "Active provider modes",
    });

    expect(
      within(activeModes).getByText("Invalid payment configuration"),
    ).toBeInTheDocument();
    expect(
      within(activeModes).queryByText("Mock payment mode"),
    ).not.toBeInTheDocument();
  });
});
