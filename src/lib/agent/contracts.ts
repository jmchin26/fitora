import { z } from "zod";

import { AgentIntentSchema } from "@/lib/agent/intent-schema";
import {
  OutfitReferenceSchema,
  OutfitSchema,
  PRODUCT_CATEGORIES,
  UserPreferencesSchema,
} from "@/lib/catalogue/schemas";

function referenceKey(
  reference: z.infer<typeof OutfitReferenceSchema>,
): string {
  return [
    reference.top.productId,
    reference.top.selectedSize,
    reference.bottom.productId,
    reference.bottom.selectedSize,
    reference.shoes.productId,
    reference.shoes.selectedSize,
  ].join("|");
}

export const AgentStateInputSchema = z
  .object({
    preferences: UserPreferencesSchema,
    outfits: z.array(OutfitReferenceSchema).min(1).max(3),
    selectedOutfit: OutfitReferenceSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    const outfitKeys = state.outfits.map(referenceKey);

    if (new Set(outfitKeys).size !== outfitKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Visible outfit references must be unique.",
        path: ["outfits"],
      });
    }

    if (
      state.selectedOutfit &&
      !outfitKeys.includes(referenceKey(state.selectedOutfit))
    ) {
      context.addIssue({
        code: "custom",
        message: "The selected outfit must be one of the visible outfits.",
        path: ["selectedOutfit"],
      });
    }
  });

export const AgentRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(280),
    state: AgentStateInputSchema,
  })
  .strict();

export const AgentFallbackCodeSchema = z.enum([
  "INVALID_CONFIGURATION",
  "NOT_CONFIGURED",
  "TIMEOUT",
  "UNAVAILABLE",
  "INVALID_OUTPUT",
  "SEMANTIC_MISMATCH",
]);

export const AgentProviderStatusSchema = z
  .object({
    configured: z.enum(["rules", "gemini", "ollama", "invalid"]),
    interpretedBy: z.enum(["rules", "gemini", "ollama"]),
    explainedBy: z.literal("template"),
    fallbackCode: AgentFallbackCodeSchema.nullable(),
  })
  .strict()
  .superRefine((provider, context) => {
    if (provider.configured === "rules") {
      if (provider.interpretedBy !== "rules") {
        context.addIssue({
          code: "custom",
          message: "Rules mode can only be interpreted by rules.",
          path: ["interpretedBy"],
        });
      }

      if (provider.fallbackCode !== null) {
        context.addIssue({
          code: "custom",
          message: "Rules mode cannot claim an AI fallback.",
          path: ["fallbackCode"],
        });
      }

      return;
    }

    if (provider.configured === "invalid") {
      if (
        provider.interpretedBy !== "rules" ||
        provider.fallbackCode !== "INVALID_CONFIGURATION"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Invalid configuration must disclose deterministic rules fallback.",
          path: ["fallbackCode"],
        });
      }

      return;
    }

    if (
      provider.interpretedBy !== provider.configured &&
      provider.interpretedBy !== "rules"
    ) {
      context.addIssue({
        code: "custom",
        message: "One AI provider cannot impersonate another provider.",
        path: ["interpretedBy"],
      });
    }

    const usedRulesFallback = provider.interpretedBy === "rules";

    if (usedRulesFallback !== (provider.fallbackCode !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "AI fallback status must agree with the provider that interpreted the request.",
        path: ["fallbackCode"],
      });
    }
  });

export const AgentEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("OUTFITS_UPDATED"),
      reason: z.enum([
        "generate",
        "change_style",
        "change_budget",
        "prefer_color",
        "exclude_color",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("ITEM_REPLACED"),
      category: z.enum(PRODUCT_CATEGORIES),
      outfitIndex: z.number().int().min(0).max(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("OUTFIT_SELECTED"),
      outfitIndex: z.number().int().min(0).max(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("CHECKOUT_REVIEW_READY"),
      outfitIndex: z.number().int().min(0).max(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("NO_CHANGE"),
      reason: z.enum([
        "help",
        "unsupported",
        "missing_target",
        "no_valid_revision",
        "selection_required",
        "invalid_budget",
      ]),
    })
    .strict(),
]);

export const AgentDiagnosticsSchema = z
  .object({
    code: z.enum(["NO_ELIGIBLE_PRODUCTS", "NO_OUTFIT_WITHIN_BUDGET"]),
    minimumAchievableTotalCents: z.number().int().positive().nullable(),
    constrainedCategories: z.array(z.enum(PRODUCT_CATEGORIES)).min(1),
    suggestions: z.array(z.string().trim().min(1)).min(1).max(2),
  })
  .strict()
  .superRefine((diagnostics, context) => {
    if (
      new Set(diagnostics.constrainedCategories).size !==
      diagnostics.constrainedCategories.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Constrained categories must be unique.",
        path: ["constrainedCategories"],
      });
    }

    const expectsMinimum =
      diagnostics.code === "NO_OUTFIT_WITHIN_BUDGET";

    if (
      expectsMinimum !==
      (diagnostics.minimumAchievableTotalCents !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Only a budget diagnostic may contain a minimum achievable total.",
        path: ["minimumAchievableTotalCents"],
      });
    }
  });

export const AgentResponseStateSchema = z
  .object({
    preferences: UserPreferencesSchema,
    outfits: z.array(OutfitSchema).max(3),
    selectedOutfitId: z.string().trim().min(1).nullable(),
    diagnostics: AgentDiagnosticsSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    const ids = state.outfits.map((outfit) => outfit.id);
    const combinations = state.outfits.map((outfit) =>
      [
        outfit.top.product.id,
        outfit.bottom.product.id,
        outfit.shoes.product.id,
      ].join("|"),
    );

    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Response outfit IDs must be unique.",
        path: ["outfits"],
      });
    }

    if (new Set(combinations).size !== combinations.length) {
      context.addIssue({
        code: "custom",
        message: "Response outfit combinations must be unique.",
        path: ["outfits"],
      });
    }

    if (
      state.selectedOutfitId &&
      !state.outfits.some((outfit) => outfit.id === state.selectedOutfitId)
    ) {
      context.addIssue({
        code: "custom",
        message: "selectedOutfitId must identify a visible outfit.",
        path: ["selectedOutfitId"],
      });
    }

    if (state.outfits.length === 0 && state.diagnostics === null) {
      context.addIssue({
        code: "custom",
        message: "An empty outfit response requires diagnostics.",
        path: ["diagnostics"],
      });
    }

    if (state.outfits.length > 0 && state.diagnostics !== null) {
      context.addIssue({
        code: "custom",
        message: "Diagnostics must be null when verified outfits are present.",
        path: ["diagnostics"],
      });
    }

    if (
      state.diagnostics?.code === "NO_OUTFIT_WITHIN_BUDGET" &&
      state.diagnostics.minimumAchievableTotalCents !== null &&
      state.diagnostics.minimumAchievableTotalCents <=
        state.preferences.budgetCents
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A budget diagnostic minimum must exceed the active budget.",
        path: ["diagnostics", "minimumAchievableTotalCents"],
      });
    }

    state.outfits.forEach((outfit, outfitIndex) => {
      if (outfit.totalCents > state.preferences.budgetCents) {
        context.addIssue({
          code: "custom",
          message: "A verified outfit cannot exceed the active budget.",
          path: ["outfits", outfitIndex, "totalCents"],
        });
      }

      const expectedSizes = {
        top: state.preferences.topSize,
        bottom: state.preferences.bottomSize,
        shoes: state.preferences.shoeSize,
      } as const;

      PRODUCT_CATEGORIES.forEach((category) => {
        const item = outfit[category];

        if (item.selectedSize !== expectedSizes[category]) {
          context.addIssue({
            code: "custom",
            message: "Selected item sizes must match the active preferences.",
            path: ["outfits", outfitIndex, category, "selectedSize"],
          });
        }

        if (!item.product.active) {
          context.addIssue({
            code: "custom",
            message: "Verified outfits cannot contain inactive products.",
            path: ["outfits", outfitIndex, category, "product", "active"],
          });
        }

        if (
          item.product.colors.some((color) =>
            state.preferences.excludedColors.includes(color),
          )
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Verified outfits cannot contain an excluded product colour.",
            path: ["outfits", outfitIndex, category, "product", "colors"],
          });
        }
      });
    });
  });

function validEventForIntent(
  intent: z.infer<typeof AgentIntentSchema>,
  event: z.infer<typeof AgentEventSchema>,
): boolean {
  if (event.type === "NO_CHANGE") {
    const allowedReasons: Record<typeof intent.type, readonly string[]> = {
      GENERATE_OUTFITS: [],
      REPLACE_ITEM: ["no_valid_revision"],
      MAKE_CHEAPER: ["no_valid_revision"],
      CHANGE_STYLE: [],
      CHANGE_BUDGET: ["invalid_budget"],
      PREFER_COLOR: [],
      EXCLUDE_COLOR: [],
      SELECT_OUTFIT: ["missing_target"],
      REQUEST_CHECKOUT: ["selection_required"],
      HELP: ["help"],
      UNSUPPORTED: ["unsupported", "missing_target"],
    };

    return allowedReasons[intent.type].includes(event.reason);
  }

  switch (intent.type) {
    case "GENERATE_OUTFITS":
      return (
        event.type === "OUTFITS_UPDATED" && event.reason === "generate"
      );
    case "REPLACE_ITEM":
    case "MAKE_CHEAPER":
      return event.type === "ITEM_REPLACED";
    case "CHANGE_STYLE":
      return (
        event.type === "OUTFITS_UPDATED" &&
        event.reason === "change_style"
      );
    case "CHANGE_BUDGET":
      return (
        event.type === "OUTFITS_UPDATED" &&
        event.reason === "change_budget"
      );
    case "PREFER_COLOR":
      return (
        event.type === "OUTFITS_UPDATED" &&
        event.reason === "prefer_color"
      );
    case "EXCLUDE_COLOR":
      return (
        event.type === "OUTFITS_UPDATED" &&
        event.reason === "exclude_color"
      );
    case "SELECT_OUTFIT":
      return event.type === "OUTFIT_SELECTED";
    case "REQUEST_CHECKOUT":
      return event.type === "CHECKOUT_REVIEW_READY";
    case "HELP":
    case "UNSUPPORTED":
      return false;
  }
}

export const AgentSuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.string().uuid(),
    intent: AgentIntentSchema,
    provider: AgentProviderStatusSchema,
    event: AgentEventSchema,
    assistantMessage: z.string().trim().min(1).max(600),
    state: AgentResponseStateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (!validEventForIntent(response.intent, response.event)) {
      context.addIssue({
        code: "custom",
        message: "The agent event must match the validated intent.",
        path: ["event"],
      });
    }

    if (
      response.event.type === "OUTFIT_SELECTED" ||
      response.event.type === "CHECKOUT_REVIEW_READY"
    ) {
      const indexedOutfit = response.state.outfits[response.event.outfitIndex];

      if (
        !indexedOutfit ||
        response.state.selectedOutfitId !== indexedOutfit.id
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Selection events must identify the selected visible outfit.",
          path: ["state", "selectedOutfitId"],
        });
      }
    }

    if (
      response.event.type === "ITEM_REPLACED" &&
      !response.state.outfits[response.event.outfitIndex]
    ) {
      context.addIssue({
        code: "custom",
        message: "A replacement event must identify a visible outfit.",
        path: ["event", "outfitIndex"],
      });
    }

    if (
      response.intent.type === "REPLACE_ITEM" &&
      response.event.type === "ITEM_REPLACED" &&
      response.event.category !== response.intent.category
    ) {
      context.addIssue({
        code: "custom",
        message: "A replacement event must identify the requested category.",
        path: ["event", "category"],
      });
    }

    if (
      response.intent.type === "MAKE_CHEAPER" &&
      response.intent.category !== null &&
      response.event.type === "ITEM_REPLACED" &&
      response.event.category !== response.intent.category
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A category-specific cheaper event must identify that category.",
        path: ["event", "category"],
      });
    }

    if (
      response.intent.type === "SELECT_OUTFIT" &&
      response.intent.position !== null &&
      response.event.type === "OUTFIT_SELECTED" &&
      response.event.outfitIndex !== response.intent.position - 1
    ) {
      context.addIssue({
        code: "custom",
        message: "The selected outfit must match the requested position.",
        path: ["event", "outfitIndex"],
      });
    }

    if (
      response.intent.type === "CHANGE_STYLE" &&
      response.event.type === "OUTFITS_UPDATED" &&
      response.state.preferences.style !== response.intent.style
    ) {
      context.addIssue({
        code: "custom",
        message: "The updated style must match the validated intent.",
        path: ["state", "preferences", "style"],
      });
    }

    if (
      response.intent.type === "CHANGE_BUDGET" &&
      response.intent.operation === "set" &&
      response.event.type === "OUTFITS_UPDATED" &&
      response.state.preferences.budgetCents !==
        response.intent.amountCents
    ) {
      context.addIssue({
        code: "custom",
        message: "The updated budget must match the validated intent.",
        path: ["state", "preferences", "budgetCents"],
      });
    }

    if (
      response.intent.type === "PREFER_COLOR" &&
      response.event.type === "OUTFITS_UPDATED" &&
      (!response.state.preferences.preferredColors.includes(
        response.intent.color,
      ) ||
        response.state.preferences.excludedColors.includes(
          response.intent.color,
        ))
    ) {
      context.addIssue({
        code: "custom",
        message: "The preferred colour update must match the intent.",
        path: ["state", "preferences", "preferredColors"],
      });
    }

    if (
      response.intent.type === "EXCLUDE_COLOR" &&
      response.event.type === "OUTFITS_UPDATED" &&
      (!response.state.preferences.excludedColors.includes(
        response.intent.color,
      ) ||
        response.state.preferences.preferredColors.includes(
          response.intent.color,
        ))
    ) {
      context.addIssue({
        code: "custom",
        message: "The excluded colour update must match the intent.",
        path: ["state", "preferences", "excludedColors"],
      });
    }

    if (
      (response.event.type === "OUTFITS_UPDATED" ||
        response.event.type === "ITEM_REPLACED") &&
      response.state.selectedOutfitId !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Outfit changes must clear the previous selection.",
        path: ["state", "selectedOutfitId"],
      });
    }
  });

export const AgentApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "INVALID_JSON",
          "INVALID_AGENT_REQUEST",
          "AGENT_STATE_INVALID",
          "AGENT_EXECUTION_FAILED",
        ]),
        message: z.string().trim().min(1),
        fields: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict(),
  })
  .strict();

export type AgentStateInput = z.infer<typeof AgentStateInputSchema>;
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentFallbackCode = z.infer<typeof AgentFallbackCodeSchema>;
export type AgentProviderStatus = z.infer<typeof AgentProviderStatusSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentDiagnostics = z.infer<typeof AgentDiagnosticsSchema>;
export type AgentResponseState = z.infer<typeof AgentResponseStateSchema>;
export type AgentSuccessResponse = z.infer<typeof AgentSuccessResponseSchema>;
export type AgentApiError = z.infer<typeof AgentApiErrorSchema>;
