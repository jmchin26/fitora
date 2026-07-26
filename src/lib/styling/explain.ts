import type {
  Product,
  ScoreBreakdown,
  UserPreferences,
} from "@/lib/catalogue/schemas";
import { formatUsd } from "@/lib/money";
import type { OutfitSelection } from "@/lib/styling/validate";

function readableLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function joinList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "none";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
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

export function explainOutfit(
  selection: OutfitSelection,
  preferences: UserPreferences,
  scoreBreakdown: ScoreBreakdown,
): string {
  const products = selectedProducts(selection);
  const occasionMatches = products.filter((product) =>
    product.occasionTags.includes(preferences.occasion),
  ).length;
  const styleMatches = products.filter((product) =>
    product.styleTags.includes(preferences.style),
  ).length;
  const catalogueColours = [
    ...new Set(products.flatMap((product) => product.colors)),
  ].sort();
  const preferred = new Set(preferences.preferredColors);
  const matchedPreferredColours = catalogueColours.filter((colour) =>
    preferred.has(colour),
  );
  const totalCents = products.reduce(
    (total, product) => total + product.priceCents,
    0,
  );
  const remainingCents = Math.max(0, preferences.budgetCents - totalCents);

  const fitSentence =
    occasionMatches === products.length && styleMatches === products.length
      ? `All three pieces are tagged for ${readableLabel(preferences.occasion)} and ${readableLabel(preferences.style)}.`
      : `${occasionMatches} of 3 pieces match ${readableLabel(preferences.occasion)}, and ${styleMatches} of 3 match ${readableLabel(preferences.style)}.`;
  const colourSentence =
    matchedPreferredColours.length > 0
      ? `The verified palette includes your preferred ${joinList(matchedPreferredColours)} colours and scores ${scoreBreakdown.colorCompatibility} of 20 for compatibility.`
      : `The verified ${joinList(catalogueColours)} palette scores ${scoreBreakdown.colorCompatibility} of 20 for compatibility.`;
  const budgetSentence = `The catalogue total is ${formatUsd(totalCents)}, leaving ${formatUsd(remainingCents)} in your budget.`;

  return `${fitSentence} ${colourSentence} ${budgetSentence}`;
}
