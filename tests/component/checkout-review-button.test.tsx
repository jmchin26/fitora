import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutReviewButton } from "@/components/checkout/checkout-review-button";
import type { Outfit, UserPreferences } from "@/lib/catalogue/schemas";
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

function outfit(): Outfit {
  const result = generateOutfits(preferences);

  if (!result.ok) {
    throw new Error("Checkout button fixture requires a verified outfit.");
  }

  return result.outfits[0];
}

function outfits(): Outfit[] {
  const result = generateOutfits(preferences);

  if (!result.ok) {
    throw new Error("Checkout button fixtures require verified outfits.");
  }

  return result.outfits;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutReviewButton", () => {
  it("sends only product ID/size references before navigating to review", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const jsonMock = vi
      .fn()
      .mockResolvedValue({ ok: true, reviewUrl: "/checkout/review" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jsonMock,
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutReviewButton outfit={outfit()} onNavigate={navigate} />);
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(jsonMock).toHaveBeenCalledOnce());
    expect(
      ((fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal)
        .aborted,
    ).toBe(false);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/checkout/review"));

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const serialized = String(request.body);
    const body = JSON.parse(serialized) as {
      outfit: Record<string, { productId: string; selectedSize: string }>;
    };

    expect(Object.keys(body)).toEqual(["outfit"]);
    expect(Object.keys(body.outfit)).toEqual(["top", "bottom", "shoes"]);
    expect(serialized).not.toContain("priceCents");
    expect(serialized).not.toContain("stockBySize");
    expect(serialized).not.toContain("totalCents");
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not navigate on a malformed response", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
            ok: true,
            reviewUrl: "https://attacker.example/checkout",
        }),
      } as unknown as Response),
    );

    render(<CheckoutReviewButton outfit={outfit()} onNavigate={navigate} />);
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unexpected review response",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("discards a review response after the selected outfit is removed", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <CheckoutReviewButton outfit={outfit()} onNavigate={navigate} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = (fetchMock.mock.calls[0][1] as RequestInit)
      .signal as AbortSignal;
    view.unmount();

    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveResponse?.({
        ok: true,
        status: 200,
        json: vi
          .fn()
          .mockResolvedValue({ ok: true, reviewUrl: "/checkout/review" }),
      } as unknown as Response);
      await Promise.resolve();
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("serializes review requests while a replaced selection is still closing", async () => {
    const user = userEvent.setup();
    const choices = outfits();
    const navigate = vi.fn();
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi
          .fn()
          .mockResolvedValue({ ok: true, reviewUrl: "/checkout/review" }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <CheckoutReviewButton
        key={choices[0].id}
        outfit={choices[0]}
        onNavigate={navigate}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );
    view.rerender(
      <CheckoutReviewButton
        key={choices[1].id}
        outfit={choices[1]}
        onNavigate={navigate}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "previous checkout review is still closing",
    );

    await act(async () => {
      resolveFirst?.({
        ok: true,
        status: 200,
        json: vi
          .fn()
          .mockResolvedValue({ ok: true, reviewUrl: "/checkout/review" }),
      } as unknown as Response);
      await Promise.resolve();
    });
    await user.click(
      screen.getByRole("button", { name: "Review selected outfit" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
