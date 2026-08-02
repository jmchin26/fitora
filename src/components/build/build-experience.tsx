"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { AgentPanel } from "@/components/agent/agent-panel";
import { LineIcon } from "@/components/ui/line-icon";
import type { AgentSuccessResponse } from "@/lib/agent/contracts";
import {
  OutfitSchema,
  PRODUCT_CATEGORIES,
  type Outfit,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import { formatUsd } from "@/lib/money";

import { OutfitCard } from "./outfit-card";
import {
  DEFAULT_PREFERENCE_DRAFT,
  PreferenceForm,
  draftFromPreferences,
  type PreferenceDraft,
} from "./preference-form";
import {
  outfitMatchesSavedSelection,
  readBuildState,
  samePreferences,
  toSafeSelectedOutfit,
  writeBuildState,
  type SafeSelectedOutfit,
} from "./storage";

const GenerationSuccessSchema = z
  .object({
    ok: z.literal(true),
    outfits: z.array(OutfitSchema).min(1).max(3),
  })
  .strict()
  .superRefine((response, context) => {
    const ids = new Set<string>();
    const combinations = new Set<string>();

    response.outfits.forEach((outfit, index) => {
      const combination = [
        outfit.top.product.id,
        outfit.bottom.product.id,
        outfit.shoes.product.id,
      ].join("|");

      if (ids.has(outfit.id)) {
        context.addIssue({
          code: "custom",
          message: "Outfit IDs must be unique.",
          path: ["outfits", index, "id"],
        });
      }

      if (combinations.has(combination)) {
        context.addIssue({
          code: "custom",
          message: "Outfit product combinations must be unique.",
          path: ["outfits", index],
        });
      }

      ids.add(outfit.id);
      combinations.add(combination);
    });
  });

const GenerationDiagnosticsSchema = z
  .object({
    code: z.enum(["NO_ELIGIBLE_PRODUCTS", "NO_OUTFIT_WITHIN_BUDGET"]),
    minimumAchievableTotalCents: z.number().int().positive().nullable(),
    constrainedCategories: z.array(z.enum(PRODUCT_CATEGORIES)),
    suggestions: z.array(z.string().trim().min(1)).max(2),
  })
  .strict();

const GenerationErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1),
        message: z.string().trim().min(1),
        fields: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict(),
    diagnostics: GenerationDiagnosticsSchema.optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (
      response.diagnostics &&
      response.error.code !== response.diagnostics.code
    ) {
      context.addIssue({
        code: "custom",
        message: "Error and diagnostic codes must match.",
        path: ["diagnostics", "code"],
      });
    }
  });

type GenerationDiagnostics = z.infer<typeof GenerationDiagnosticsSchema>;

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      outfits: Outfit[];
      preferences: UserPreferences;
    }
  | {
      status: "no-results";
      message: string;
      diagnostics: GenerationDiagnostics;
      preferences: UserPreferences;
    }
  | { status: "error"; message: string };

function preferenceSummary(preferences: UserPreferences): string {
  const occasion = preferences.occasion.replace("_", " ");
  const style = preferences.style.replace("_", " ");

  return `${occasion} · ${style} · ${formatUsd(preferences.budgetCents)} budget`;
}

function readyMessage(outfitCount: number): string {
  const countLabel = ["No", "One", "Two", "Three"][outfitCount] ?? String(outfitCount);
  const noun = outfitCount === 1 ? "outfit is" : "outfits are";

  return `${countLabel} ${noun} ready. Choose one look.`;
}

function LoadingCards() {
  return (
    <div aria-hidden="true" className="space-y-5">
      {[0, 1].map((index) => (
        <div
          className="grid min-h-[25rem] animate-pulse overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-strong)] motion-reduce:animate-none xl:grid-cols-[0.92fr_1.08fr]"
          key={index}
        >
          <div className="bg-[#e8e1d5]" />
          <div className="space-y-5 p-6">
            <div className="h-7 w-2/3 bg-[#e8e1d5]" />
            <div className="h-14 bg-[#eee9e0]" />
            <div className="h-14 bg-[#eee9e0]" />
            <div className="h-14 bg-[#eee9e0]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyIntroduction() {
  return (
    <div className="flex min-h-[25rem] items-end border border-[var(--line)] bg-[#ebe6dd] p-7 sm:p-10">
      <div className="max-w-md border-l-2 border-[var(--ink)] pl-5">
        <p className="font-serif text-3xl tracking-[-0.035em]">Your looks will appear here.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
          Set your preferences, then choose the outfit that feels most like you.
        </p>
      </div>
    </div>
  );
}

function NoResults({
  message,
  diagnostics,
}: {
  message: string;
  diagnostics: GenerationDiagnostics;
}) {
  return (
    <section
      aria-labelledby="no-results-title"
      className="border border-[#a76752] bg-[#f4e5de] p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#713f32]">
        No verified match yet
      </p>
      <h3 className="mt-2 font-serif text-3xl" id="no-results-title">
        {message}
      </h3>
      {diagnostics.minimumAchievableTotalCents !== null ? (
        <p className="mt-3 text-sm text-[#623c30]">
          The least expensive eligible complete outfit is currently{" "}
          <strong>
            {formatUsd(diagnostics.minimumAchievableTotalCents)}
          </strong>
          .
        </p>
      ) : null}
      {diagnostics.constrainedCategories.length > 0 ? (
        <p className="mt-2 text-sm text-[#623c30]">
          Tightest {diagnostics.constrainedCategories.length === 1 ? "category" : "categories"}: {" "}
          {diagnostics.constrainedCategories.join(", ")}.
        </p>
      ) : null}
      {diagnostics.suggestions.length > 0 ? (
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-[#623c30]">
          {diagnostics.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-5 text-sm font-semibold text-[#623c30]">
        Adjust the form and build again. Nothing has been selected or charged.
      </p>
    </section>
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function BuildExperience() {
  const [draft, setDraft] = useState<PreferenceDraft>(
    DEFAULT_PREFERENCE_DRAFT,
  );
  const [requestState, setRequestState] = useState<RequestState>({
    status: "idle",
  });
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(
    null,
  );
  const [savedPreferences, setSavedPreferences] =
    useState<UserPreferences | null>(null);
  const [savedSelection, setSavedSelection] =
    useState<SafeSelectedOutfit | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [resultsAreStale, setResultsAreStale] = useState(false);
  const [hasGeneratedOutfits, setHasGeneratedOutfits] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const initialBuildState = useRef<ReturnType<typeof readBuildState> | null>(
    null,
  );

  useEffect(() => {
    initialBuildState.current ??= readBuildState();
    const restored = initialBuildState.current;
    let active = true;

    if (restored.status !== "empty") {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        if (restored.status === "loaded") {
          setDraft(draftFromPreferences(restored.state.preferences));
          setSavedPreferences(restored.state.preferences);
          setSavedSelection(restored.state.selectedOutfit);
          setStorageNotice(
            restored.state.selectedOutfit
              ? "Saved preferences restored. Build again to verify and restore your prior selection."
              : "Saved preferences restored on this device.",
          );
        } else if (restored.status === "corrupt") {
          setStorageNotice(
            "Saved preferences could not be verified, so the standard preferences were loaded.",
          );
        } else {
          setStorageAvailable(false);
          setStorageNotice(
            "Browser storage is unavailable. You can still use Fitora for this session.",
          );
        }
      });
    }

    return () => {
      active = false;
      activeRequest.current?.abort();
    };
  }, []);

  function persistState(
    preferences: UserPreferences,
    selectedOutfit: SafeSelectedOutfit | null,
  ): boolean {
    const persisted = writeBuildState({
      version: 1,
      preferences,
      selectedOutfit,
    });

    if (!persisted) {
      setStorageAvailable(false);
      setStorageNotice(
        "Browser storage is unavailable. Your current session still works normally.",
      );
    }

    return persisted;
  }

  function handleDraftChange(nextDraft: PreferenceDraft) {
    setDraft(nextDraft);

    if (requestState.status === "loading") {
      activeRequest.current?.abort();
      activeRequest.current = null;
      setRequestState({ status: "idle" });
      setSelectedOutfitId(null);
      return;
    }

    if (requestState.status === "success" && !resultsAreStale) {
      setResultsAreStale(true);
      setSelectedOutfitId(null);
      setSavedSelection(null);
      persistState(requestState.preferences, null);
    }
  }

  async function handleGenerate(preferences: UserPreferences) {
    activeRequest.current?.abort();
    const requestController = new AbortController();
    activeRequest.current = requestController;

    const canRestoreSelection = Boolean(
      savedPreferences &&
        savedSelection &&
        samePreferences(savedPreferences, preferences),
    );
    const selectionToRestore = canRestoreSelection ? savedSelection : null;

    setRequestState({ status: "loading" });
    setSelectedOutfitId(null);
    setResultsAreStale(false);
    setSavedPreferences(preferences);
    setSavedSelection(selectionToRestore);
    persistState(preferences, selectionToRestore);

    try {
      const response = await fetch("/api/outfits/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
        signal: requestController.signal,
      });
      const responseBody = await readJsonResponse(response);

      if (
        requestController.signal.aborted ||
        activeRequest.current !== requestController
      ) {
        return;
      }

      if (response.ok) {
        const parsedResponse = GenerationSuccessSchema.safeParse(responseBody);

        if (!parsedResponse.success) {
          setRequestState({
            status: "error",
            message:
              "Fitora returned an unexpected catalogue response. No outfit was selected; please try again.",
          });
          setSavedSelection(null);
          persistState(preferences, null);
          return;
        }

        const restoredOutfit = selectionToRestore
          ? parsedResponse.data.outfits.find((outfit) =>
              outfitMatchesSavedSelection(outfit, selectionToRestore),
            )
          : undefined;
        const verifiedSelection = restoredOutfit
          ? toSafeSelectedOutfit(restoredOutfit)
          : null;

        setRequestState({
          status: "success",
          outfits: parsedResponse.data.outfits,
          preferences,
        });
        setHasGeneratedOutfits(true);
        setSelectedOutfitId(restoredOutfit?.id ?? null);
        setSavedSelection(verifiedSelection);
        persistState(preferences, verifiedSelection);
        return;
      }

      const parsedError = GenerationErrorSchema.safeParse(responseBody);

      if (
        response.status === 422 &&
        parsedError.success &&
        parsedError.data.diagnostics
      ) {
        setRequestState({
          status: "no-results",
          message: parsedError.data.error.message,
          diagnostics: parsedError.data.diagnostics,
          preferences,
        });
        setSavedSelection(null);
        persistState(preferences, null);
        return;
      }

      setRequestState({
        status: "error",
        message: parsedError.success
          ? parsedError.data.error.message
          : `Fitora could not build outfits (request ${response.status}). Please try again.`,
      });
      setSavedSelection(null);
      persistState(preferences, null);
    } catch (error) {
      if (
        requestController.signal.aborted ||
        activeRequest.current !== requestController ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setRequestState({
        status: "error",
        message:
          "Fitora could not reach the catalogue service. Check your connection and try again.",
      });
      setSavedSelection(null);
      persistState(preferences, null);
    } finally {
      if (activeRequest.current === requestController) {
        activeRequest.current = null;
      }
    }
  }

  function handleSelectOutfit(outfit: Outfit) {
    if (requestState.status !== "success" || resultsAreStale) {
      return;
    }

    const safeSelection = toSafeSelectedOutfit(outfit);
    setSelectedOutfitId(outfit.id);
    setSavedSelection(safeSelection);
    persistState(requestState.preferences, safeSelection);
  }

  function handleAgentResponse(response: AgentSuccessResponse) {
    const nextPreferences = response.state.preferences;
    const selectedOutfit = response.state.selectedOutfitId
      ? response.state.outfits.find(
          (outfit) => outfit.id === response.state.selectedOutfitId,
        )
      : undefined;
    const safeSelection = selectedOutfit
      ? toSafeSelectedOutfit(selectedOutfit)
      : null;

    setDraft(draftFromPreferences(nextPreferences));
    setSavedPreferences(nextPreferences);
    setSavedSelection(safeSelection);
    setSelectedOutfitId(response.state.selectedOutfitId);
    setResultsAreStale(false);

    if (response.state.outfits.length > 0) {
      setRequestState({
        status: "success",
        outfits: response.state.outfits,
        preferences: nextPreferences,
      });
    } else if (response.state.diagnostics) {
      setRequestState({
        status: "no-results",
        message: response.assistantMessage,
        diagnostics: response.state.diagnostics,
        preferences: nextPreferences,
      });
    }

    persistState(nextPreferences, safeSelection);
  }

  const visibleSelectedOutfit =
    requestState.status === "success" && selectedOutfitId
      ? (requestState.outfits.find(
          (outfit) => outfit.id === selectedOutfitId,
        ) ?? null)
      : null;

  let liveMessage = "Ready to style up to three outfits.";

  if (requestState.status === "loading") {
    liveMessage = "Putting together your outfits.";
  } else if (requestState.status === "success") {
    if (resultsAreStale) {
      liveMessage = "Preferences changed. Build again to refresh your results.";
    } else if (selectedOutfitId) {
      const selectedIndex = requestState.outfits.findIndex(
        (outfit) => outfit.id === selectedOutfitId,
      );
      liveMessage = storageAvailable
        ? `Look ${String(selectedIndex + 1).padStart(2, "0")} selected and saved safely on this device.`
        : `Look ${String(selectedIndex + 1).padStart(2, "0")} selected for this session.`;
    } else {
      liveMessage = readyMessage(requestState.outfits.length);
    }
  } else if (requestState.status === "no-results") {
    liveMessage = "No complete outfit matches every current constraint.";
  } else if (requestState.status === "error") {
    liveMessage = requestState.message;
  }

  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-6 lg:px-12 lg:py-6">
      <div className="mx-auto grid w-full max-w-[96rem] gap-9 xl:grid-cols-[27.5rem_minmax(0,1fr)] xl:items-start xl:gap-10">
        <div>
          {storageNotice ? (
            <p className="mb-4 border-l-2 border-[var(--sage)] pl-3 text-sm text-[var(--muted-ink)]">
              {storageNotice}
            </p>
          ) : null}
          <PreferenceForm
            draft={draft}
            isSubmitting={requestState.status === "loading"}
            onDraftChange={handleDraftChange}
            onValidSubmit={(preferences) => void handleGenerate(preferences)}
          />
        </div>

        <div aria-busy={requestState.status === "loading"} className="min-w-0">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-serif text-3xl tracking-[-0.035em] sm:text-4xl">
                Your edit
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-ink)]">Three complete looks, styled around your preferences.</p>
            </div>
            {requestState.status === "success" ? (
              <p className="text-sm capitalize text-[var(--muted-ink)]">
                {preferenceSummary(requestState.preferences)}
              </p>
            ) : null}
          </div>

          <p
            aria-live="polite"
            className={`mb-5 border-t border-[var(--line)] pt-4 text-sm font-semibold ${
              requestState.status === "error"
                ? "text-[#8a352d]"
                : "text-[var(--muted-ink)]"
            }`}
            role={requestState.status === "error" ? "alert" : "status"}
          >
            {liveMessage}
          </p>

          {requestState.status === "idle" ? <EmptyIntroduction /> : null}
          {requestState.status === "loading" ? <LoadingCards /> : null}
          {requestState.status === "no-results" ? (
            <NoResults
              diagnostics={requestState.diagnostics}
              message={requestState.message}
            />
          ) : null}
          {requestState.status === "error" ? (
            <div className="border border-[#a76752] bg-[#f4e5de] p-6">
              <h3 className="font-serif text-2xl">We could not build this edit.</h3>
              <p className="mt-2 text-sm text-[#623c30]">
                {requestState.message}
              </p>
              <p className="mt-3 text-sm font-semibold text-[#623c30]">
                No outfit was selected or sent to checkout.
              </p>
            </div>
          ) : null}

          {requestState.status === "success" ? (
            <>
              {resultsAreStale ? (
                <div className="mb-5 border border-[#9b7b45] bg-[#f1ead8] p-4 text-sm text-[#5f4a25]">
                  These looks reflect your last submitted preferences. Build
                  again before selecting from the updated form.
                </div>
              ) : null}
              <fieldset>
                <legend className="sr-only">Choose one outfit</legend>
                <div className="grid gap-4 lg:grid-cols-3">
                  {requestState.outfits.map((outfit, index) => (
                    <OutfitCard
                      budgetCents={requestState.preferences.budgetCents}
                      disabled={resultsAreStale}
                      index={index}
                      key={outfit.id}
                      onSelect={handleSelectOutfit}
                      outfit={outfit}
                      selected={outfit.id === selectedOutfitId}
                    />
                  ))}
                </div>
              </fieldset>

              {visibleSelectedOutfit && !resultsAreStale ? (
                <div className="mt-6 flex flex-col justify-between gap-4 rounded-md border border-[var(--sage-dark)] bg-[#e5e8df] p-5 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
                  <div>
                    <p className="font-serif text-xl text-[var(--sage-dark)]">
                      Outfit selected
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted-ink)]">
                      {storageAvailable
                        ? "Fitora stores only product IDs, requested sizes, and safe preferences on this device. "
                        : "This selection is available for the current browser session only. "}
                      The server will verify every price and stock fact again
                      before checkout.
                    </p>
                  </div>
                  <a
                    className="flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[var(--sage-dark)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                    href="#adjust-look"
                  >
                    Adjust selected look
                    <LineIcon className="h-4 w-4" name="arrow" />
                  </a>
                </div>
              ) : null}
            </>
          ) : null}

          {hasGeneratedOutfits && savedPreferences ? (
            <div className="mt-10">
              <AgentPanel
                disabled={
                  resultsAreStale || requestState.status !== "success"
                }
                onVerifiedResponse={handleAgentResponse}
                onSelectOutfit={handleSelectOutfit}
                outfits={
                  requestState.status === "success"
                    ? requestState.outfits
                    : []
                }
                preferences={
                  requestState.status === "success" ||
                  requestState.status === "no-results"
                    ? requestState.preferences
                    : savedPreferences
                }
                selectedOutfitId={
                  requestState.status === "success"
                    ? selectedOutfitId
                    : null
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
