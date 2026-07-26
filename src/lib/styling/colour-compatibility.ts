import type { Product } from "@/lib/catalogue/schemas";

export const SUPPORTED_COLOURS = [
  "black",
  "white",
  "navy",
  "charcoal",
  "stone",
  "olive",
  "sage",
  "cream",
  "beige",
  "brown",
  "grey",
  "burgundy",
] as const;

export type SupportedColour = (typeof SUPPORTED_COLOURS)[number];

/**
 * Pair scores are deliberately explicit: 2 is a strong pairing, 1 is a
 * workable pairing, and 0 is a pairing the deterministic engine avoids.
 */
export const COLOUR_COMPATIBILITY_MATRIX = {
  black: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 1,
    cream: 2,
    beige: 2,
    brown: 1,
    grey: 2,
    burgundy: 2,
  },
  white: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 2,
  },
  navy: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 2,
  },
  charcoal: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 1,
    cream: 2,
    beige: 2,
    brown: 1,
    grey: 2,
    burgundy: 2,
  },
  stone: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 1,
  },
  olive: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 1,
    burgundy: 0,
  },
  sage: {
    black: 1,
    white: 2,
    navy: 2,
    charcoal: 1,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 1,
  },
  cream: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 2,
  },
  beige: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 2,
    burgundy: 1,
  },
  brown: {
    black: 1,
    white: 2,
    navy: 2,
    charcoal: 1,
    stone: 2,
    olive: 2,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 2,
    grey: 1,
    burgundy: 1,
  },
  grey: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 2,
    olive: 1,
    sage: 2,
    cream: 2,
    beige: 2,
    brown: 1,
    grey: 2,
    burgundy: 2,
  },
  burgundy: {
    black: 2,
    white: 2,
    navy: 2,
    charcoal: 2,
    stone: 1,
    olive: 0,
    sage: 1,
    cream: 2,
    beige: 1,
    brown: 1,
    grey: 2,
    burgundy: 2,
  },
} as const satisfies Record<
  SupportedColour,
  Record<SupportedColour, 0 | 1 | 2>
>;

function normalizeColour(colour: string): string {
  return colour.trim().toLowerCase();
}

function isSupportedColour(colour: string): colour is SupportedColour {
  return (SUPPORTED_COLOURS as readonly string[]).includes(colour);
}

export function getColourPairCompatibility(
  first: string,
  second: string,
): 0 | 1 | 2 {
  const normalizedFirst = normalizeColour(first);
  const normalizedSecond = normalizeColour(second);

  if (
    !isSupportedColour(normalizedFirst) ||
    !isSupportedColour(normalizedSecond)
  ) {
    return normalizedFirst === normalizedSecond ? 2 : 0;
  }

  return COLOUR_COMPATIBILITY_MATRIX[normalizedFirst][normalizedSecond];
}

/**
 * Returns an integer score from 0 to 20 across all three product pairs.
 * Catalogue colour order is meaningful: the first value is the dominant
 * product colour, while later values describe secondary details.
 */
export function scoreColourCompatibility(
  products: readonly [Product, Product, Product],
): number {
  const [top, bottom, shoes] = products;
  const topColour = top.colors[0];
  const bottomColour = bottom.colors[0];
  const shoesColour = shoes.colors[0];
  const pairScore =
    getColourPairCompatibility(topColour, bottomColour) +
    getColourPairCompatibility(topColour, shoesColour) +
    getColourPairCompatibility(bottomColour, shoesColour);

  return Math.round((pairScore / 6) * 20);
}
