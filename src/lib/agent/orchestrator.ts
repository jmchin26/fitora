import {
  AgentRequestSchema,
  AgentSuccessResponseSchema,
  type AgentDiagnostics,
  type AgentEvent,
  type AgentFallbackCode,
  type AgentProviderStatus,
  type AgentRequest,
  type AgentResponseState,
  type AgentSuccessResponse,
} from "@/lib/agent/contracts";
import type { AgentIntent } from "@/lib/agent/intent-schema";
import { buildAgentMessage } from "@/lib/agent/messages";
import {
  resolveAgentProvider,
  type AgentProviderFactoryOptions,
  type AgentProviderResolution,
} from "@/lib/agent/providers/factory";
import {
  AgentProviderError,
  type AgentProvider,
} from "@/lib/agent/providers/types";
import {
  canonicalizeAgentState,
  type CanonicalAgentState,
} from "@/lib/agent/canonical-state";
import {
  changeBudget,
  changeStyle,
  excludeColor,
  makeCheaper,
  preferColor,
  replaceItem,
  type PreferenceRevisionResult,
} from "@/lib/agent/revisions";
import { parseRuleIntent } from "@/lib/agent/rules";
import { guardIntentSemanticEvidence } from "@/lib/agent/semantic-guard";
import {
  AgentIntentSchema,
} from "@/lib/agent/intent-schema";
import { getCatalogue } from "@/lib/catalogue/repository";
import type {
  Outfit,
  OutfitReference,
  Product,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

export const AGENT_ORCHESTRATION_ERROR_CODES = [
  "INVALID_AGENT_REQUEST",
  "AGENT_STATE_INVALID",
  "AGENT_EXECUTION_FAILED",
] as const;

export type AgentOrchestrationErrorCode =
  (typeof AGENT_ORCHESTRATION_ERROR_CODES)[number];

export class AgentOrchestrationError extends Error {
  readonly code: AgentOrchestrationErrorCode;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: AgentOrchestrationErrorCode,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AgentOrchestrationError";
    this.code = code;
    this.fields = fields;
  }
}

export type AgentOrchestratorOptions = {
  signal?: AbortSignal;
  catalogue?: readonly Product[];
  providerResolution?: AgentProviderResolution;
  providerOptions?: AgentProviderFactoryOptions;
  requestId?: () => string;
};

type InterpretedIntent = {
  intent: AgentIntent;
  provider: AgentProviderStatus;
};

type ExecutedIntent = {
  event: AgentEvent;
  state: AgentResponseState;
};

class AgentSemanticMismatchError extends Error {
  constructor() {
    super("The provider intent did not match the user message.");
    this.name = "AgentSemanticMismatchError";
  }
}

function outfitToReference(outfit: Outfit): OutfitReference {
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

function diagnosticsFromGeneration(
  diagnostics: AgentDiagnostics,
): AgentDiagnostics {
  return {
    code: diagnostics.code,
    minimumAchievableTotalCents:
      diagnostics.minimumAchievableTotalCents,
    constrainedCategories: [...diagnostics.constrainedCategories],
    suggestions: [...diagnostics.suggestions],
  };
}

function responseStateFromCanonical(
  state: CanonicalAgentState,
): AgentResponseState {
  return {
    preferences: state.preferences,
    outfits: state.outfits,
    selectedOutfitId: state.selectedOutfit?.id ?? null,
    diagnostics: null,
  };
}

function providerStateSummary(state: CanonicalAgentState) {
  const selectedOutfitPosition = state.selectedOutfit
    ? state.outfits.findIndex(
        (outfit) => outfit.id === state.selectedOutfit?.id,
      ) + 1
    : null;

  return {
    occasion: state.preferences.occasion,
    budgetCents: state.preferences.budgetCents,
    style: state.preferences.style,
    preferredColors: state.preferences.preferredColors,
    excludedColors: state.preferences.excludedColors,
    visibleOutfitCount: state.outfits.length,
    selectedOutfitPosition,
  };
}

function fallbackCodeForError(error: unknown): AgentFallbackCode {
  if (!(error instanceof AgentProviderError)) {
    return "UNAVAILABLE";
  }

  switch (error.reason) {
    case "NOT_CONFIGURED":
      return "NOT_CONFIGURED";
    case "INVALID_CONFIGURATION":
      return "INVALID_CONFIGURATION";
    case "TIMEOUT":
      return "TIMEOUT";
    case "UNAVAILABLE":
      return "UNAVAILABLE";
    case "INVALID_INPUT":
    case "INVALID_OUTPUT":
      return "INVALID_OUTPUT";
    case "ABORTED":
      return "UNAVAILABLE";
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new AgentProviderError(
      "rules",
      "ABORTED",
      "The agent request was cancelled.",
    );
  }
}

function validatedRuleIntent(message: string): AgentIntent {
  const parsed = AgentIntentSchema.safeParse(parseRuleIntent(message));

  if (!parsed.success) {
    throw new AgentOrchestrationError(
      "AGENT_EXECUTION_FAILED",
      "The deterministic agent could not interpret this request.",
    );
  }

  const evidence = guardIntentSemanticEvidence(message, parsed.data);

  if (!evidence.ok) {
    throw new AgentOrchestrationError(
      "AGENT_EXECUTION_FAILED",
      "The deterministic agent could not verify this request.",
    );
  }

  return evidence.intent;
}

async function interpretWithProvider(
  provider: AgentProvider,
  message: string,
  state: CanonicalAgentState,
  signal: AbortSignal,
): Promise<AgentIntent> {
  const rawIntent = await provider.interpret(
    {
      message,
      state: providerStateSummary(state),
    },
    signal,
  );
  const parsed = AgentIntentSchema.safeParse(rawIntent);

  if (!parsed.success) {
    throw new AgentProviderError(
      provider.name,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid intent.",
    );
  }

  const evidence = guardIntentSemanticEvidence(message, parsed.data);

  if (!evidence.ok) {
    throw new AgentSemanticMismatchError();
  }

  return evidence.intent;
}

async function resolveIntent(
  request: AgentRequest,
  state: CanonicalAgentState,
  resolution: AgentProviderResolution,
  signal: AbortSignal,
): Promise<InterpretedIntent> {
  if (resolution.status !== "ready") {
    throwIfAborted(signal);

    return {
      intent: validatedRuleIntent(request.message),
      provider: {
        configured: resolution.configured,
        interpretedBy: "rules",
        explainedBy: "template",
        fallbackCode: resolution.reason,
      },
    };
  }

  if (resolution.provider.name === "rules") {
    throwIfAborted(signal);
    const intent = validatedRuleIntent(request.message);

    return {
      intent,
      provider: {
        configured: resolution.configured,
        interpretedBy: "rules",
        explainedBy: "template",
        fallbackCode: null,
      },
    };
  }

  try {
    const intent = await interpretWithProvider(
      resolution.provider,
      request.message,
      state,
      signal,
    );

    return {
      intent,
      provider: {
        configured: resolution.configured,
        interpretedBy: resolution.provider.name,
        explainedBy: "template",
        fallbackCode: null,
      },
    };
  } catch (error) {
    if (
      error instanceof AgentProviderError &&
      error.reason === "ABORTED"
    ) {
      throw error;
    }

    throwIfAborted(signal);
    const fallbackCode =
      error instanceof AgentSemanticMismatchError
        ? "SEMANTIC_MISMATCH"
        : fallbackCodeForError(error);

    return {
      intent: validatedRuleIntent(request.message),
      provider: {
        configured: resolution.configured,
        interpretedBy: "rules",
        explainedBy: "template",
        fallbackCode,
      },
    };
  }
}

function unchanged(
  state: CanonicalAgentState,
  event: AgentEvent,
): ExecutedIntent {
  return { event, state: responseStateFromCanonical(state) };
}

function preferenceRevision(
  result: PreferenceRevisionResult,
  reason: Extract<
    AgentEvent,
    { type: "OUTFITS_UPDATED" }
  >["reason"],
  state: CanonicalAgentState,
): ExecutedIntent {
  if (!result.ok) {
    return unchanged(state, {
      type: "NO_CHANGE",
      reason: "invalid_budget",
    });
  }

  if (result.status === "no_results") {
    return {
      event: { type: "OUTFITS_UPDATED", reason },
      state: {
        preferences: result.preferences,
        outfits: [],
        selectedOutfitId: null,
        diagnostics: diagnosticsFromGeneration(
          result.diagnostics.generation,
        ),
      },
    };
  }

  return {
    event: { type: "OUTFITS_UPDATED", reason },
    state: {
      preferences: result.preferences,
      outfits: result.outfits,
      selectedOutfitId: null,
      diagnostics: null,
    },
  };
}

function selectedOrFirstOutfitIndex(state: CanonicalAgentState): number {
  if (!state.selectedOutfit) {
    return 0;
  }

  const selectedIndex = state.outfits.findIndex(
    (outfit) => outfit.id === state.selectedOutfit?.id,
  );

  return selectedIndex >= 0 ? selectedIndex : 0;
}

function applyReplacement(
  intent: Extract<AgentIntent, { type: "REPLACE_ITEM" | "MAKE_CHEAPER" }>,
  state: CanonicalAgentState,
  catalogue: readonly Product[],
): ExecutedIntent {
  const outfitIndex = selectedOrFirstOutfitIndex(state);
  const currentOutfit = state.outfits[outfitIndex];
  const currentReference = outfitToReference(currentOutfit);
  const otherOutfitIds = state.outfits
    .filter((_outfit, index) => index !== outfitIndex)
    .map((outfit) => outfit.id);
  const result =
    intent.type === "REPLACE_ITEM"
      ? replaceItem(
          currentReference,
          state.preferences,
          {
            category: intent.category,
            strictCheaper: intent.requireCheaper,
            targetStyle: intent.targetStyle ?? undefined,
            targetColor: intent.targetColor ?? undefined,
          },
          otherOutfitIds,
          catalogue,
        )
      : makeCheaper(
          currentReference,
          state.preferences,
          intent.category,
          otherOutfitIds,
          catalogue,
        );

  if (!result.ok) {
    return unchanged(state, {
      type: "NO_CHANGE",
      reason: "no_valid_revision",
    });
  }

  const outfits = [...state.outfits];
  outfits[outfitIndex] = result.outfit;

  return {
    event: {
      type: "ITEM_REPLACED",
      category: result.changedCategory,
      outfitIndex,
    },
    state: {
      preferences: state.preferences,
      outfits,
      selectedOutfitId: null,
      diagnostics: null,
    },
  };
}

function nextBudget(
  preferences: UserPreferences,
  intent: Extract<AgentIntent, { type: "CHANGE_BUDGET" }>,
): number | null {
  const next =
    intent.operation === "set"
      ? intent.amountCents
      : intent.operation === "increase_by"
        ? preferences.budgetCents + intent.amountCents
        : preferences.budgetCents - intent.amountCents;

  return Number.isSafeInteger(next) && next > 0 ? next : null;
}

function executeIntent(
  intent: AgentIntent,
  state: CanonicalAgentState,
  catalogue: readonly Product[],
): ExecutedIntent {
  switch (intent.type) {
    case "GENERATE_OUTFITS": {
      const result = generateOutfits(state.preferences, catalogue);

      if (!result.ok) {
        return {
          event: { type: "OUTFITS_UPDATED", reason: "generate" },
          state: {
            preferences: state.preferences,
            outfits: [],
            selectedOutfitId: null,
            diagnostics: diagnosticsFromGeneration(result.diagnostics),
          },
        };
      }

      return {
        event: { type: "OUTFITS_UPDATED", reason: "generate" },
        state: {
          preferences: state.preferences,
          outfits: result.outfits,
          selectedOutfitId: null,
          diagnostics: null,
        },
      };
    }

    case "REPLACE_ITEM":
    case "MAKE_CHEAPER":
      return applyReplacement(intent, state, catalogue);

    case "CHANGE_STYLE":
      return preferenceRevision(
        changeStyle(state.preferences, intent.style, catalogue),
        "change_style",
        state,
      );

    case "CHANGE_BUDGET": {
      const budgetCents = nextBudget(state.preferences, intent);

      if (budgetCents === null) {
        return unchanged(state, {
          type: "NO_CHANGE",
          reason: "invalid_budget",
        });
      }

      return preferenceRevision(
        changeBudget(state.preferences, budgetCents, catalogue),
        "change_budget",
        state,
      );
    }

    case "PREFER_COLOR":
      return preferenceRevision(
        preferColor(state.preferences, intent.color, catalogue),
        "prefer_color",
        state,
      );

    case "EXCLUDE_COLOR":
      return preferenceRevision(
        excludeColor(state.preferences, intent.color, catalogue),
        "exclude_color",
        state,
      );

    case "SELECT_OUTFIT": {
      const outfitIndex =
        intent.position === null
          ? state.selectedOutfit
            ? state.outfits.findIndex(
                (outfit) => outfit.id === state.selectedOutfit?.id,
              )
            : -1
          : intent.position - 1;

      if (outfitIndex < 0 || !state.outfits[outfitIndex]) {
        return unchanged(state, {
          type: "NO_CHANGE",
          reason: "missing_target",
        });
      }

      return {
        event: { type: "OUTFIT_SELECTED", outfitIndex },
        state: {
          preferences: state.preferences,
          outfits: state.outfits,
          selectedOutfitId: state.outfits[outfitIndex].id,
          diagnostics: null,
        },
      };
    }

    case "REQUEST_CHECKOUT": {
      const outfitIndex = state.selectedOutfit
        ? state.outfits.findIndex(
            (outfit) => outfit.id === state.selectedOutfit?.id,
          )
        : -1;

      if (outfitIndex < 0) {
        return unchanged(state, {
          type: "NO_CHANGE",
          reason: "selection_required",
        });
      }

      return unchanged(state, {
        type: "CHECKOUT_REVIEW_READY",
        outfitIndex,
      });
    }

    case "HELP":
      return unchanged(state, { type: "NO_CHANGE", reason: "help" });

    case "UNSUPPORTED":
      return unchanged(state, {
        type: "NO_CHANGE",
        reason:
          intent.reason === "MISSING_TARGET" ||
          intent.reason === "AMBIGUOUS_TARGET"
            ? "missing_target"
            : "unsupported",
      });
  }
}

function verifyExecutedState(
  state: AgentResponseState,
  catalogue: readonly Product[],
) {
  const selectedOutfit = state.selectedOutfitId
    ? state.outfits.find((outfit) => outfit.id === state.selectedOutfitId)
    : undefined;

  if (state.selectedOutfitId && !selectedOutfit) {
    throw new AgentOrchestrationError(
      "AGENT_EXECUTION_FAILED",
      "Fitora could not verify the updated outfit selection.",
    );
  }

  const canonical = canonicalizeAgentState(
    {
      preferences: state.preferences,
      outfits: state.outfits.map(outfitToReference),
      selectedOutfit: selectedOutfit
        ? outfitToReference(selectedOutfit)
        : null,
    },
    catalogue,
  );

  if (
    !canonical.ok ||
    JSON.stringify(canonical.state.outfits) !==
      JSON.stringify(state.outfits) ||
    (canonical.state.selectedOutfit?.id ?? null) !==
      state.selectedOutfitId
  ) {
    throw new AgentOrchestrationError(
      "AGENT_EXECUTION_FAILED",
      "Fitora could not verify the updated outfit state.",
    );
  }
}

/**
 * Runs one bounded agent turn. Provider output is only an intent proposal;
 * catalogue rehydration and every state change remain deterministic here.
 */
export async function orchestrateAgent(
  input: unknown,
  options: AgentOrchestratorOptions = {},
): Promise<AgentSuccessResponse> {
  const parsedRequest = AgentRequestSchema.safeParse(input);

  if (!parsedRequest.success) {
    throw new AgentOrchestrationError(
      "INVALID_AGENT_REQUEST",
      "Review the agent message and verified outfit state, then try again.",
      parsedRequest.error.flatten().fieldErrors,
    );
  }

  const catalogue = options.catalogue ?? getCatalogue();
  const canonical = canonicalizeAgentState(
    parsedRequest.data.state,
    catalogue,
  );

  if (!canonical.ok) {
    throw new AgentOrchestrationError(
      "AGENT_STATE_INVALID",
      "The submitted outfit state could not be verified. Build the outfits again.",
    );
  }

  const signal = options.signal ?? new AbortController().signal;
  throwIfAborted(signal);
  const resolution =
    options.providerResolution ??
    resolveAgentProvider(options.providerOptions);
  const interpreted = await resolveIntent(
    parsedRequest.data,
    canonical.state,
    resolution,
    signal,
  );
  throwIfAborted(signal);
  const executed = executeIntent(
    interpreted.intent,
    canonical.state,
    catalogue,
  );
  verifyExecutedState(executed.state, catalogue);
  const response = {
    ok: true,
    requestId: (options.requestId ?? (() => crypto.randomUUID()))(),
    intent: interpreted.intent,
    provider: interpreted.provider,
    event: executed.event,
    assistantMessage: buildAgentMessage(
      executed.event,
      interpreted.intent,
      executed.state,
    ),
    state: executed.state,
  };
  const parsedResponse = AgentSuccessResponseSchema.safeParse(response);

  if (!parsedResponse.success) {
    throw new AgentOrchestrationError(
      "AGENT_EXECUTION_FAILED",
      "Fitora could not produce a verified agent response.",
    );
  }

  return parsedResponse.data;
}
