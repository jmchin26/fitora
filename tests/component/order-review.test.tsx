import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderReview } from "@/components/checkout/order-review";
import type { UserPreferences } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import { formatUsd } from "@/lib/money";
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
    throw new Error("Order review fixture requires an outfit.");
  }

  const outfit = outfits.outfits[0];
  const result = verifyCheckoutOrder({
    outfit: {
      top: {
        productId: outfit.top.product.id,
        selectedSize: outfit.top.selectedSize,
      },
      bottom: {
        productId: outfit.bottom.product.id,
        selectedSize: outfit.bottom.selectedSize,
      },
      shoes: {
        productId: outfit.shoes.product.id,
        selectedSize: outfit.shoes.selectedSize,
      },
    },
  });

  if (!result.ok) {
    throw new Error("Order review fixture must verify.");
  }

  return result.order;
}

describe("OrderReview", () => {
  it("shows the complete canonical order, merchant, sizes, and total", () => {
    const order = verifiedOrder();
    render(<OrderReview order={order} />);

    expect(
      screen.getByRole("heading", { name: "Review your outfit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Verified order items" })).toBeInTheDocument();

    order.items.forEach((item) => {
      const heading = screen.getByRole("heading", { name: item.name });
      const itemElement = heading.closest("li");

      expect(itemElement).not.toBeNull();
      expect(screen.queryByText(`Product ${item.productId}`)).not.toBeInTheDocument();
      expect(
        within(itemElement as HTMLLIElement).getByText(item.selectedSize, {
          selector: "span",
        }),
      ).toBeInTheDocument();
      expect(
        within(itemElement as HTMLLIElement).getByText(
          formatUsd(item.lineTotalCents),
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Prices shown in USD")).toBeInTheDocument();
    expect(screen.queryByText(order.merchantId)).not.toBeInTheDocument();
    expect(screen.getAllByText(formatUsd(order.totalCents)).length).toBeGreaterThan(0);
  });
});
