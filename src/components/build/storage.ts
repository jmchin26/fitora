import { z } from "zod";

import {
  OutfitReferenceSchema,
  UserPreferencesSchema,
  type Outfit,
  type OutfitReference,
  type UserPreferences,
} from "@/lib/catalogue/schemas";

export const FITORA_BUILD_STATE_KEY = "fitora.build.v1";

const SafeSelectedOutfitSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    reference: OutfitReferenceSchema,
  })
  .strict();

const SafeBuildStateSchema = z
  .object({
    version: z.literal(1),
    preferences: UserPreferencesSchema,
    selectedOutfit: SafeSelectedOutfitSchema.nullable(),
  })
  .strict();

export type SafeSelectedOutfit = z.infer<typeof SafeSelectedOutfitSchema>;
export type SafeBuildState = z.infer<typeof SafeBuildStateSchema>;

export type ReadBuildStateResult =
  | { status: "empty" }
  | { status: "loaded"; state: SafeBuildState }
  | { status: "corrupt" }
  | { status: "unavailable" };

export function readBuildState(): ReadBuildStateResult {
  let rawValue: string | null;

  try {
    rawValue = window.localStorage.getItem(FITORA_BUILD_STATE_KEY);
  } catch {
    return { status: "unavailable" };
  }

  if (rawValue === null) {
    return { status: "empty" };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawValue);
  } catch {
    try {
      window.localStorage.removeItem(FITORA_BUILD_STATE_KEY);
    } catch {
      return { status: "unavailable" };
    }

    return { status: "corrupt" };
  }

  const parsedState = SafeBuildStateSchema.safeParse(parsedJson);

  if (!parsedState.success) {
    try {
      window.localStorage.removeItem(FITORA_BUILD_STATE_KEY);
    } catch {
      return { status: "unavailable" };
    }

    return { status: "corrupt" };
  }

  return { status: "loaded", state: parsedState.data };
}

export function writeBuildState(state: unknown): boolean {
  const parsedState = SafeBuildStateSchema.safeParse(state);

  if (!parsedState.success) {
    return false;
  }

  try {
    window.localStorage.setItem(
      FITORA_BUILD_STATE_KEY,
      JSON.stringify(parsedState.data),
    );
    return true;
  } catch {
    return false;
  }
}

export function toSafeSelectedOutfit(outfit: Outfit): SafeSelectedOutfit {
  return {
    id: outfit.id,
    reference: {
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
  };
}

function sameProductReference(
  first: OutfitReference[keyof OutfitReference],
  second: OutfitReference[keyof OutfitReference],
): boolean {
  return (
    first.productId === second.productId &&
    first.selectedSize === second.selectedSize
  );
}

export function outfitMatchesSavedSelection(
  outfit: Outfit,
  savedSelection: SafeSelectedOutfit,
): boolean {
  const currentSelection = toSafeSelectedOutfit(outfit);

  return (
    sameProductReference(
      currentSelection.reference.top,
      savedSelection.reference.top,
    ) &&
    sameProductReference(
      currentSelection.reference.bottom,
      savedSelection.reference.bottom,
    ) &&
    sameProductReference(
      currentSelection.reference.shoes,
      savedSelection.reference.shoes,
    )
  );
}

export function samePreferences(
  first: UserPreferences,
  second: UserPreferences,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
