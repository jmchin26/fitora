"use client";

import { useEffect, useRef, useState } from "react";

import {
  CheckoutApiErrorSchema,
  CheckoutReviewStartedSchema,
} from "@/lib/checkout/api-contracts";
import type { Outfit, OutfitReference } from "@/lib/catalogue/schemas";

type CheckoutReviewButtonProps = {
  outfit: Outfit;
  disabled?: boolean;
  onNavigate?: (url: string) => void;
};

// Only one review request may mutate checkout cookies in a browser tab at a
// time. A replacement selection can retry as soon as the aborted request has
// settled, preventing two responses from racing to overwrite signed state.
let activeReviewFlight: AbortController | null = null;

function toReference(outfit: Outfit): OutfitReference {
  return {
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
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function CheckoutReviewButton({
  outfit,
  disabled = false,
  onNavigate,
}: CheckoutReviewButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const buttonElement = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [outfit.id]);

  async function beginReview() {
    if (disabled || isLoading) {
      return;
    }

    if (activeReviewFlight) {
      setErrorMessage(
        "The previous checkout review is still closing. Try again in a moment.",
      );
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    const requestOutfitId = outfit.id;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    activeRequest.current = controller;
    activeReviewFlight = controller;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/checkout/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfit: toReference(outfit) }),
        signal: controller.signal,
      });
      const body = await readJson(response);

      if (
        controller.signal.aborted ||
        activeRequest.current !== controller ||
        buttonElement.current?.dataset.outfitId !== requestOutfitId ||
        !buttonElement.current?.isConnected
      ) {
        return;
      }

      if (!response.ok) {
        const parsedError = CheckoutApiErrorSchema.safeParse(body);
        setErrorMessage(
          parsedError.success
            ? parsedError.data.error.message
            : "Fitora could not prepare this checkout review. Rebuild and select the outfit again.",
        );
        return;
      }

      const parsed = CheckoutReviewStartedSchema.safeParse(body);

      if (!parsed.success) {
        setErrorMessage(
          "Fitora returned an unexpected review response. No payment session was created.",
        );
        return;
      }

      const navigate =
        onNavigate ?? ((url: string) => window.location.assign(url));
      navigate(parsed.data.reviewUrl);
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setErrorMessage(
        "Fitora could not reach the checkout review service. No payment session was created.",
      );
    } finally {
      window.clearTimeout(timeout);

      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
      }

      if (activeReviewFlight === controller) {
        activeReviewFlight = null;
      }
    }
  }

  return (
    <div className="shrink-0 sm:text-right">
      <button
        ref={buttonElement}
        data-outfit-id={outfit.id}
        className="min-h-12 bg-[var(--ink)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-60"
        disabled={disabled || isLoading}
        onClick={() => void beginReview()}
        type="button"
      >
        {isLoading ? "Verifying order…" : "Review selected outfit"}
      </button>
      <p className="mt-2 max-w-xs text-xs text-[var(--muted-ink)]">
        This verifies the order summary. It does not create a payment session.
      </p>
      {errorMessage ? (
        <p
          className="mt-3 max-w-xs text-sm font-semibold text-[#8a352d]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
