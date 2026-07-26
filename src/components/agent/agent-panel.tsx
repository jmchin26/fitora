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
  type AgentSuccessResponse,
} from "@/lib/agent/contracts";
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

function providerLabel(provider: "rules" | "gemini" | "ollama" | "invalid") {
  if (provider === "gemini") {
    return "Gemini";
  }

  if (provider === "ollama") {
    return "Local Ollama";
  }

  if (provider === "invalid") {
    return "Invalid configuration";
  }

  return "Rules fallback";
}

function fallbackLabel(fallbackCode: string): string {
  return fallbackCode
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function AgentPanel({
  disabled = false,
  outfits,
  preferences,
  selectedOutfitId,
  onVerifiedResponse,
}: AgentPanelProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latestResponse, setLatestResponse] =
    useState<AgentSuccessResponse | null>(null);
  const activeRequest = useRef<ActiveAgentRequest | null>(null);
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
          "Fitora returned an unexpected agent response. Your verified outfits were not changed.",
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
        "Fitora could not reach the styling agent. Your verified outfits were not changed.",
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

  return (
    <section
      aria-labelledby="agent-panel-title"
      className="border border-[var(--line)] bg-[#e7e8e1] p-5 sm:p-7"
    >
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
            Step 03
          </p>
          <h2
            className="mt-2 font-serif text-3xl tracking-[-0.035em]"
            id="agent-panel-title"
          >
            Refine with Fitora
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted-ink)]">
            Ask for one controlled change at a time. Catalogue facts, prices,
            stock, and totals are verified by deterministic tools.
          </p>
        </div>
        <span className="w-fit border border-[var(--sage)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[var(--sage-dark)]">
          No autonomous checkout
        </span>
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold">Try a verified revision</p>
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
          One change for this edit
        </label>
        <textarea
          aria-describedby="agent-message-help agent-character-count"
          className="mt-2 min-h-28 w-full resize-y border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-base text-[var(--ink)] focus:border-[var(--sage-dark)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!isAvailable}
          id="agent-message"
          maxLength={280}
          onChange={(event) => setMessage(event.currentTarget.value)}
          placeholder="For example: make this outfit more relaxed"
          value={message}
        />
        <div className="mt-2 flex flex-col justify-between gap-2 text-xs text-[var(--muted-ink)] sm:flex-row">
          <p id="agent-message-help">
            Only this message, safe preferences, and product ID/size references
            are sent.
          </p>
          <p
            aria-live="polite"
            className="tabular-nums"
            id="agent-character-count"
          >
            {characterCount}/280
          </p>
        </div>
        <button
          className="mt-4 min-h-12 bg-[var(--ink)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-60"
          disabled={!isAvailable || isLoading || message.trim().length === 0}
          type="submit"
        >
          {isLoading ? "Verifying change…" : "Ask Fitora"}
        </button>
      </form>

      {!isAvailable ? (
        <p
          className="mt-5 border-l-2 border-[#9b7b45] pl-3 text-sm text-[#5f4a25]"
          role="status"
        >
          Build a current set of verified outfits before asking for another
          revision.
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
          className="mt-5 border border-[var(--sage)] bg-[var(--surface)] p-5"
          role="status"
        >
          <p className="font-serif text-xl text-[var(--sage-dark)]">
            Fitora’s verified response
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            {latestResponse.assistantMessage}
          </p>

          {latestResponse.event.type === "CHECKOUT_REVIEW_READY" ? (
            <p className="mt-4 border-l-2 border-[var(--sage-dark)] pl-3 text-sm font-bold text-[var(--sage-dark)]">
              Checkout review is ready. No payment session was created.
            </p>
          ) : null}

          <dl className="mt-5 grid gap-2 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted-ink)] sm:grid-cols-3">
            <div>
              <dt className="font-bold uppercase tracking-[0.1em]">
                Configured
              </dt>
              <dd className="mt-1">
                {providerLabel(latestResponse.provider.configured)}
              </dd>
            </div>
            <div>
              <dt className="font-bold uppercase tracking-[0.1em]">
                Interpreted by
              </dt>
              <dd className="mt-1">
                {providerLabel(latestResponse.provider.interpretedBy)}
              </dd>
            </div>
            <div>
              <dt className="font-bold uppercase tracking-[0.1em]">
                Fallback
              </dt>
              <dd className="mt-1">
                {latestResponse.provider.fallbackCode
                  ? fallbackLabel(latestResponse.provider.fallbackCode)
                  : "None"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
