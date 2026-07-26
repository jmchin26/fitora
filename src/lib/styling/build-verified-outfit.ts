import type {
  Outfit,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { explainOutfit } from "@/lib/styling/explain";
import { scoreOutfit } from "@/lib/styling/rank";
import {
  validateOutfit,
  type OutfitSelection,
} from "@/lib/styling/validate";

/**
 * Builds presentation facts only after the complete selection passes the
 * deterministic domain validator. Callers must supply catalogue-backed
 * products; untrusted references should be rehydrated first.
 */
export function buildVerifiedOutfit(
  selection: OutfitSelection,
  preferences: UserPreferences,
): Outfit | null {
  const validation = validateOutfit(selection, preferences);

  if (!validation.valid) {
    return null;
  }

  const ranking = scoreOutfit(selection, preferences);
  const id = [
    selection.top.product.id,
    selection.bottom.product.id,
    selection.shoes.product.id,
  ].join("__");

  return {
    id: `outfit__${id}`,
    top: selection.top,
    bottom: selection.bottom,
    shoes: selection.shoes,
    totalCents: validation.computedTotalCents,
    score: ranking.score,
    scoreBreakdown: ranking.scoreBreakdown,
    reasonCodes: ranking.reasonCodes,
    explanation: explainOutfit(
      selection,
      preferences,
      ranking.scoreBreakdown,
    ),
  };
}
