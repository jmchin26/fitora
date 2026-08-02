"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  AgentApiErrorSchema,
  AgentSuccessResponseSchema,
  type AgentEvent,
  type AgentSuccessResponse,
} from "@/lib/agent/contracts";
import { AgentLookPreview } from "@/components/agent/agent-look-preview";
import { CheckoutReviewButton } from "@/components/checkout/checkout-review-button";
import { LineIcon } from "@/components/ui/line-icon";
import type {
  Outfit,
  OutfitReference,
  UserPreferences,
} from "@/lib/catalogue/schemas";

const SUGGESTED_COMMANDS = [
  "Replace the shoes with a cheaper option",
  "Make this outfit more relaxed",
  "Avoid white",
  "Use more navy",
  "Lower the budget to $130",
] as const;

const CLARIFICATION_OPTIONS = [
  {
    label: "Price",
    description: "Lower the outfit total",
    draft: "Make this outfit cheaper",
    icon: "tag",
  },
  {
    label: "Style",
    description: "Change the overall mood",
    draft: "Make this outfit more relaxed",
    icon: "hanger",
  },
  {
    label: "Colour",
    description: "Prefer or avoid a colour",
    draft: "Prefer navy",
    icon: "wave",
  },
  {
    label: "Item",
    description: "Replace one piece",
    draft: "Replace the shoes",
    icon: "shirt",
  },
] as const;

type ActiveAgentRequest = {
  controller: AbortController;
  contextKey: string;
  token: number;
};

export type AgentPanelProps = {
  disabled?: boolean;
  outfits: Outfit[];
  preferences: UserPreferences;
  selectedOutfitId: string | null;
  onSelectOutfit?: (outfit: Outfit) => void;
  onVerifiedResponse: (response: AgentSuccessResponse) => void;
};

function toOutfitReference(outfit: Outfit): OutfitReference {
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

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function eventOutfitIndex(event: AgentEvent): number | null {
  if (
    event.type === "ITEM_REPLACED" ||
    event.type === "OUTFIT_SELECTED" ||
    event.type === "CHECKOUT_REVIEW_READY"
  ) {
    return event.outfitIndex;
  }

  return null;
}

export function AgentPanel({
  disabled = false,
  outfits,
  preferences,
  selectedOutfitId,
  onSelectOutfit,
  onVerifiedResponse,
}: AgentPanelProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestResponse, setLatestResponse] =
    useState<AgentSuccessResponse | null>(null);
  const activeRequest = useRef<ActiveAgentRequest | null>(null);
  const messageInput = useRef<HTMLTextAreaElement | null>(null);
  const nextToken = useRef(0);
  const latestDisabled = useRef(disabled);
  const latestOnVerifiedResponse = useRef(onVerifiedResponse);

  const outfitReferences = outfits.map(toOutfitReference);
  const selectedOutfit = selectedOutfitId
    ? outfits.find((outfit) => outfit.id === selectedOutfitId)
    : undefined;
  const requestState = {
    preferences,
    outfits: outfitReferences,
    selectedOutfit: selectedOutfit
      ? toOutfitReference(selectedOutfit)
      : null,
  };
  const contextKey = JSON.stringify(requestState);
  const latestContextKey = useRef(contextKey);

  useEffect(() => {
    latestContextKey.current = contextKey;
    latestDisabled.current = disabled;
    latestOnVerifiedResponse.current = onVerifiedResponse;
  }, [contextKey, disabled, onVerifiedResponse]);

  useEffect(() => {
    const request = activeRequest.current;

    if (
      request &&
      (disabled || request.contextKey !== contextKey)
    ) {
      request.controller.abort();
      activeRequest.current = null;
      nextToken.current += 1;
      setIsLoading(false);
    }
  }, [contextKey, disabled]);

  useEffect(
    () => () => {
      activeRequest.current?.controller.abort();
      activeRequest.current = null;
    },
    [],
  );

  async function sendMessage(rawMessage: string) {
    const trimmedMessage = rawMessage.trim();

    if (
      trimmedMessage.length === 0 ||
      trimmedMessage.length > 280 ||
      disabled ||
      outfits.length === 0
    ) {
      return;
    }

    activeRequest.current?.controller.abort();
    const controller = new AbortController();
    const token = nextToken.current + 1;
    nextToken.current = token;
    const request = { controller, contextKey, token };
    activeRequest.current = request;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          state: requestState,
        }),
        signal: controller.signal,
      });
      const responseBody = await readJsonResponse(response);

      if (
        controller.signal.aborted ||
        activeRequest.current?.token !== token ||
        latestContextKey.current !== contextKey ||
        latestDisabled.current
      ) {
        return;
      }

      if (!response.ok) {
        const parsedError = AgentApiErrorSchema.safeParse(responseBody);
        setErrorMessage(
          parsedError.success
            ? parsedError.data.error.message
            : `Fitora could not apply that request (request ${response.status}). Please try again.`,
        );
        return;
      }

      const parsedResponse =
        AgentSuccessResponseSchema.safeParse(responseBody);

      if (!parsedResponse.success) {
        setErrorMessage(
          "Something went wrong while updating your look. Your outfits were not changed.",
        );
        return;
      }

      activeRequest.current = null;
      setIsLoading(false);
      setLatestResponse(parsedResponse.data);
      setMessage("");
      latestOnVerifiedResponse.current(parsedResponse.data);
    } catch (error) {
      if (
        controller.signal.aborted ||
        activeRequest.current?.token !== token ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setErrorMessage(
        "We could not update your look just now. Your outfits were not changed.",
      );
    } finally {
      if (activeRequest.current?.token === token) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(message);
  }

  const isAvailable = !disabled && outfits.length > 0;
  const characterCount = message.length;
  const latestResponseIsNoChange = latestResponse?.event.type === "NO_CHANGE";
  const latestResponseNeedsClarification =
    latestResponse?.event.type === "NO_CHANGE" &&
    (latestResponse.event.reason === "unsupported" ||
      latestResponse.event.reason === "missing_target");
  const previewOutfits = latestResponse
    ? latestResponse.state.outfits
    : outfits;
  const previewSelectedOutfitId = latestResponse
    ? latestResponse.state.selectedOutfitId
    : selectedOutfitId;
  const selectedPreviewIndex = previewSelectedOutfitId
    ? previewOutfits.findIndex(
        (outfit) => outfit.id === previewSelectedOutfitId,
      )
    : -1;
  const responsePreviewIndex = latestResponse
    ? eventOutfitIndex(latestResponse.event)
    : null;
  const previewIndex =
    responsePreviewIndex !== null && previewOutfits[responsePreviewIndex]
      ? responsePreviewIndex
      : selectedPreviewIndex >= 0
        ? selectedPreviewIndex
        : 0;
  const previewOutfit = previewOutfits[previewIndex] ?? null;
  const previewWasUpdated = Boolean(
    latestResponse && latestResponse.event.type !== "NO_CHANGE",
  );
  const previewIsSelected = previewOutfit?.id === selectedOutfitId;

  function prepareClarifiedRequest(draft: string) {
    setMessage(draft);
    setErrorMessage(null);
    messageInput.current?.focus();
    window.requestAnimationFrame(() => {
      messageInput.current?.setSelectionRange(draft.length, draft.length);
    });
  }

  return (
    <section
      aria-labelledby="agent-panel-title"
      className="border border-[var(--line)] bg-[var(--surface-muted)] p-5 sm:p-7"
      id="adjust-look"
    >
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-start">
        <div>
          <h2
            className="font-serif text-3xl tracking-[-0.035em]"
            id="agent-panel-title"
          >
            Adjust your look
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted-ink)]">
            Swap a colour, lower the budget or change the mood. Make one
            request at a time.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(17rem,0.74fr)_minmax(0,1.26fr)] lg:items-start xl:gap-8">
        <AgentLookPreview
          index={previewIndex}
          outfit={previewOutfit}
          updated={previewWasUpdated}
        />

        <div className="min-w-0">
      <div>
        <p className="text-sm font-bold">Popular changes</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED_COMMANDS.map((command) => (
            <button
              className="min-h-11 border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-left text-sm font-semibold transition-colors hover:border-[var(--sage-dark)] hover:text-[var(--sage-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isAvailable || isLoading}
              key={command}
              onClick={() => void sendMessage(command)}
              type="button"
            >
              {command}
            </button>
          ))}
        </div>
      </div>

      <form className="mt-5" onSubmit={handleSubmit}>
        <label className="text-sm font-bold" htmlFor="agent-message">
          What would you change?
        </label>
        <textarea
          aria-describedby="agent-message-help agent-character-count"
          className="mt-2 min-h-24 max-h-48 w-full resize-y border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base leading-6 text-[var(--ink)] transition-colors focus:border-[var(--sage-dark)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:bg-[#e8e7e2] disabled:text-[var(--muted-ink)]"
          disabled={!isAvailable}
          id="agent-message"
          maxLength={280}
          onChange={(event) => setMessage(event.currentTarget.value)}
          placeholder="For example: make this outfit more relaxed"
          ref={messageInput}
          rows={3}
          value={message}
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4 text-xs text-[var(--muted-ink)] sm:justify-start">
            <p id="agent-message-help">One clear change works best.</p>
            <p
              aria-live="polite"
              className="tabular-nums"
              id="agent-character-count"
            >
              {characterCount}/280
            </p>
          </div>
          <button
            className="flex min-h-12 min-w-40 items-center justify-center gap-3 bg-[var(--ink)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--sage-dark)] disabled:cursor-not-allowed disabled:bg-[#d5d6d1] disabled:text-[#666b63] disabled:opacity-100"
            disabled={!isAvailable || isLoading || message.trim().length === 0}
            type="submit"
          >
            {isLoading ? "Updating look…" : "Apply change"}
            {!isLoading && message.trim().length > 0 ? (
              <LineIcon className="h-4 w-4" name="arrow" />
            ) : null}
          </button>
        </div>
      </form>

      {!isAvailable ? (
        <p
          className="mt-5 border-l-2 border-[#9b7b45] pl-3 text-sm text-[#5f4a25]"
          role="status"
        >
          Choose a current look before asking for a change.
        </p>
      ) : null}

      {errorMessage ? (
        <p
          className="mt-5 border border-[#a76752] bg-[#f4e5de] p-4 text-sm font-semibold text-[#713f32]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {latestResponse ? (
        <div
          aria-live="polite"
          className={`mt-5 border-l-4 p-5 ${
            latestResponseIsNoChange
              ? "border-[#a88d55] bg-[#f5f0e4]"
              : "border-[var(--sage-dark)] bg-[var(--surface)]"
          }`}
          role="status"
        >
          <p className="font-serif text-xl text-[var(--sage-dark)]">
            {latestResponseNeedsClarification
              ? "What should I improve?"
              : latestResponseIsNoChange
                ? "No changes made"
                : "Your updated edit"}
          </p>
          {latestResponseNeedsClarification ? (
            <>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed">
                Choose one area. I’ll prepare a clear request for you to review
                before anything changes.
              </p>
              <div
                aria-label="Choose what to improve"
                className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                role="group"
              >
                {CLARIFICATION_OPTIONS.map((option) => (
                  <button
                    className="group flex min-h-20 items-start gap-3 border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors hover:border-[var(--sage-dark)] hover:bg-[var(--surface-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    disabled={!isAvailable || isLoading}
                    key={option.label}
                    onClick={() => prepareClarifiedRequest(option.draft)}
                    type="button"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--line)] text-[var(--sage-dark)] group-hover:border-[var(--sage-dark)]">
                      <LineIcon className="h-4 w-4" name={option.icon} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-ink)]">
                        {option.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted-ink)]">
                You can edit the prepared request before applying it.
              </p>
            </>
          ) : (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed">
              {latestResponse.assistantMessage}
            </p>
          )}

          {latestResponse.event.type === "CHECKOUT_REVIEW_READY" ? (
            <p className="mt-4 border-l-2 border-[var(--sage-dark)] pl-3 text-sm font-bold text-[var(--sage-dark)]">
              Checkout review is ready. No payment session was created.
            </p>
          ) : null}

        </div>
      ) : null}

      {onSelectOutfit && previewOutfit ? (
        <div className="mt-5 flex flex-col justify-between gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center">
          <div className="max-w-md">
            <p className="font-serif text-xl text-[var(--sage-dark)]">
              {previewIsSelected
                ? "Ready for order review"
                : "Confirm the updated look"}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
              {previewIsSelected
                ? "Review sizes, items and total before opening secure checkout."
                : "Select this verified version before reviewing the order. No payment session will be created yet."}
            </p>
          </div>
          {previewIsSelected ? (
            <CheckoutReviewButton
              key={previewOutfit.id}
              outfit={previewOutfit}
            />
          ) : (
            <button
              className="flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[var(--sage-dark)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              disabled={!isAvailable || isLoading}
              onClick={() => onSelectOutfit(previewOutfit)}
              type="button"
            >
              Select this look
              <LineIcon className="h-4 w-4" name="check" />
            </button>
          )}
        </div>
      ) : null}
        </div>
      </div>
    </section>
  );
}
