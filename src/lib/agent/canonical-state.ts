import { z } from "zod";

import { getCatalogue } from "@/lib/catalogue/repository";
import {
  OutfitReferenceSchema,
  UserPreferencesSchema,
  type Outfit,
  type OutfitReference,
  type Product,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import {
  rehydrateOutfitSelection,
  type RehydrationIssue,
} from "@/lib/catalogue/rehydrate";
import { buildVerifiedOutfit } from "@/lib/styling/build-verified-outfit";

export const CanonicalAgentStateInputSchema = z
  .object({
    preferences: UserPreferencesSchema,
    outfits: z.array(OutfitReferenceSchema).max(3),
    selectedOutfit: OutfitReferenceSchema.nullable(),
  })
  .strict();

export type CanonicalAgentStateInput = z.infer<
  typeof CanonicalAgentStateInputSchema
>;

export type CanonicalAgentState = {
  preferences: UserPreferences;
  outfits: Outfit[];
  selectedOutfit: Outfit | null;
};

export type CanonicalStateDiagnostic =
  | {
      code: "INVALID_STATE";
      message: string;
    }
  | {
      code: "DUPLICATE_OUTFIT_REFERENCE";
      message: string;
      outfitIndex: number;
    }
  | {
      code: "SELECTION_NOT_IN_OUTFITS";
      message: string;
    }
  | {
      code: "OUTFIT_REHYDRATION_FAILED";
      message: string;
      outfitIndex: number;
      issues: RehydrationIssue[];
    }
  | {
      code: "OUTFIT_BUILD_FAILED";
      message: string;
      outfitIndex: number;
    };

export type CanonicalizeAgentStateResult =
  | {
      ok: true;
      state: CanonicalAgentState;
    }
  | {
      ok: false;
      diagnostics: CanonicalStateDiagnostic[];
    };

function referenceKey(reference: OutfitReference): string {
  return [
    reference.top.productId,
    reference.top.selectedSize,
    reference.bottom.productId,
    reference.bottom.selectedSize,
    reference.shoes.productId,
    reference.shoes.selectedSize,
  ].join("|");
}

/**
 * Re-establishes authoritative server state from the minimal client-safe
 * representation. Prices, stock, merchant data, scores, and explanations are
 * always reconstructed from the canonical catalogue.
 */
export function canonicalizeAgentState(
  input: unknown,
  catalogue: readonly Product[] = getCatalogue(),
): CanonicalizeAgentStateResult {
  const parsed = CanonicalAgentStateInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "INVALID_STATE",
          message:
            "Agent state must contain only valid preferences and outfit references.",
        },
      ],
    };
  }

  const diagnostics: CanonicalStateDiagnostic[] = [];
  const seenReferenceKeys = new Set<string>();
  const canonicalOutfits: Outfit[] = [];
  const outfitByReferenceKey = new Map<string, Outfit>();

  parsed.data.outfits.forEach((reference, outfitIndex) => {
    const key = referenceKey(reference);

    if (seenReferenceKeys.has(key)) {
      diagnostics.push({
        code: "DUPLICATE_OUTFIT_REFERENCE",
        message: "The same outfit reference cannot appear more than once.",
        outfitIndex,
      });
    }
    seenReferenceKeys.add(key);

    const rehydrated = rehydrateOutfitSelection(
      reference,
      parsed.data.preferences,
      catalogue,
    );

    if (!rehydrated.ok) {
      diagnostics.push({
        code: "OUTFIT_REHYDRATION_FAILED",
        message: "An outfit reference could not be verified.",
        outfitIndex,
        issues: rehydrated.issues,
      });
      return;
    }

    const outfit = buildVerifiedOutfit(
      rehydrated.selection,
      parsed.data.preferences,
    );

    if (!outfit) {
      diagnostics.push({
        code: "OUTFIT_BUILD_FAILED",
        message: "An outfit failed deterministic verification.",
        outfitIndex,
      });
      return;
    }

    canonicalOutfits.push(outfit);
    outfitByReferenceKey.set(key, outfit);
  });

  const selectedReferenceKey = parsed.data.selectedOutfit
    ? referenceKey(parsed.data.selectedOutfit)
    : null;

  if (
    selectedReferenceKey !== null &&
    !seenReferenceKeys.has(selectedReferenceKey)
  ) {
    diagnostics.push({
      code: "SELECTION_NOT_IN_OUTFITS",
      message: "The selected outfit must be one of the supplied outfits.",
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    state: {
      preferences: parsed.data.preferences,
      outfits: canonicalOutfits,
      selectedOutfit:
        selectedReferenceKey === null
          ? null
          : (outfitByReferenceKey.get(selectedReferenceKey) ?? null),
    },
  };
}
