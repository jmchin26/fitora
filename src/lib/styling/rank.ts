import type {
  Product,
  ScoreBreakdown,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { sumCents } from "@/lib/money";
import { scoreColourCompatibility } from "@/lib/styling/colour-compatibility";
import type { OutfitSelection } from "@/lib/styling/validate";

export const SCORE_WEIGHTS = {
  occasion: 30,
  style: 25,
  colorCompatibility: 20,
  preferredColors: 15,
  budgetEfficiency: 10,
} as const satisfies ScoreBreakdown;

export type OutfitScore = {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasonCodes: string[];
};

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function selectedProducts(
  selection: OutfitSelection,
): readonly [Product, Product, Product] {
  return [
    selection.top.product,
    selection.bottom.product,
    selection.shoes.product,
  ];
}

function countPreferredColourMatches(
  products: readonly Product[],
  preferredColours: readonly string[],
): number {
  const preferred = new Set(
    preferredColours.map((colour) => colour.trim().toLowerCase()),
  );

  return products.filter((product) =>
    product.colors.some((colour) =>
      preferred.has(colour.trim().toLowerCase()),
    ),
  ).length;
}

export function scoreOutfit(
  selection: OutfitSelection,
  preferences: UserPreferences,
): OutfitScore {
  const products = selectedProducts(selection);
  const occasionMatches = products.filter((product) =>
    product.occasionTags.includes(preferences.occasion),
  ).length;
  const styleMatches = products.filter((product) =>
    product.styleTags.includes(preferences.style),
  ).length;
  const preferredColourMatches = countPreferredColourMatches(
    products,
    preferences.preferredColors,
  );
  const hasColourPreference = preferences.preferredColors.length > 0;
  const totalCents = sumCents(products.map((product) => product.priceCents));

  const scoreBreakdown: ScoreBreakdown = {
    occasion: clampInteger(
      (occasionMatches / products.length) * SCORE_WEIGHTS.occasion,
      0,
      SCORE_WEIGHTS.occasion,
    ),
    style: clampInteger(
      (styleMatches / products.length) * SCORE_WEIGHTS.style,
      0,
      SCORE_WEIGHTS.style,
    ),
    colorCompatibility: clampInteger(
      scoreColourCompatibility(products),
      0,
      SCORE_WEIGHTS.colorCompatibility,
    ),
    preferredColors: hasColourPreference
      ? clampInteger(
          (preferredColourMatches / products.length) *
            SCORE_WEIGHTS.preferredColors,
          0,
          SCORE_WEIGHTS.preferredColors,
        )
      : SCORE_WEIGHTS.preferredColors,
    budgetEfficiency:
      preferences.budgetCents <= 0
        ? 0
        : clampInteger(
            ((preferences.budgetCents - totalCents) /
              preferences.budgetCents) *
              SCORE_WEIGHTS.budgetEfficiency,
            0,
            SCORE_WEIGHTS.budgetEfficiency,
          ),
  };

  const score = clampInteger(
    Object.values(scoreBreakdown).reduce(
      (total, component) => total + component,
      0,
    ),
    0,
    100,
  );

  return {
    score,
    scoreBreakdown,
    reasonCodes: [
      `occasion-match:${occasionMatches}-of-3`,
      `style-match:${styleMatches}-of-3`,
      `colour-compatibility:${scoreBreakdown.colorCompatibility}-of-20`,
      hasColourPreference
        ? `preferred-colour-match:${preferredColourMatches}-of-3`
        : "preferred-colour:not-specified-neutral-score",
      `budget-efficiency:${scoreBreakdown.budgetEfficiency}-of-10`,
    ],
  };
}
