import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockCheckout } from "@/components/checkout/mock-checkout";
import type { UserPreferences } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import { generateOutfits } from "@/lib/styling/generate";

const preferences: UserPreferences = {
  occasion: "presentation",
  budgetCents: 15_000,
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

function verifiedOrder(): VerifiedOrder {
  const outfits = generateOutfits(preferences);

  if (!outfits.ok) {
    throw new Error("Mock checkout fixture requires an outfit.");
  }

  const outfit = outfits.outfits[0];
  const verified = verifyCheckoutOrder({
    outfit: {
      top: { productId: outfit.top.product.id, selectedSize: outfit.top.selectedSize },
      bottom: { productId: outfit.bottom.product.id, selectedSize: outfit.bottom.selectedSize },
      shoes: { productId: outfit.shoes.product.id, selectedSize: outfit.shoes.selectedSize },
    },
  });

  if (!verified.ok) {
    throw new Error("Mock checkout fixture must verify.");
  }

  return verified.order;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MockCheckout", () => {
  it("keeps mock mode explicit and exposes no card-data controls", () => {
    render(<MockCheckout order={verifiedOrder()} />);

    expect(
      screen.getByText("Mock payment mode — Prava credentials are not configured."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Simulate the hosted payment" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/card number|cvv|expiry|otp/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cannot create a real charge/i)).toBeInTheDocument();
  });

  it.each([
    ["Approve mock payment", "approve"],
    ["Decline mock payment", "decline"],
  ] as const)("submits the %s decision and navigates to the sanitized result", async (buttonName, decision) => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        status: decision === "approve" ? "mock_success" : "declined",
        redirectUrl: "/checkout/result",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MockCheckout order={verifiedOrder()} onNavigate={navigate} />);

    await user.click(screen.getByRole("button", { name: buttonName }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/checkout/result"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/checkout/finalize",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("does not navigate when finalization returns an invalid body", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          status: "approved",
          redirectUrl: "https://attacker.example/result",
        }),
      ),
    );
    render(<MockCheckout order={verifiedOrder()} onNavigate={navigate} />);

    await user.click(screen.getByRole("button", { name: "Approve mock payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unexpected mock result",
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
