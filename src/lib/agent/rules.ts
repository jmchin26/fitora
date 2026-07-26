import {
  PRODUCT_CATEGORIES,
  PRODUCT_COLORS,
  STYLES,
  type ProductCategory,
  type ProductColor,
  type Style,
} from "@/lib/catalogue/schemas";
import type {
  AgentIntent,
  ChangeBudgetOperation,
  UnsupportedReason,
} from "@/lib/agent/intent-schema";

const CATEGORY_PATTERNS: Readonly<
  Record<ProductCategory, readonly RegExp[]>
> = {
  top: [
    /\btop\b/,
    /\bshirt\b/,
    /\bblouse\b/,
    /\btee\b/,
    /\bt[ -]?shirt\b/,
  ],
  bottom: [
    /\bbottoms?\b/,
    /\bpants?\b/,
    /\btrousers?\b/,
    /\bskirt\b/,
  ],
  shoes: [
    /\bshoes?\b/,
    /\bfootwear\b/,
    /\bsneakers?\b/,
    /\bloafers?\b/,
    /\bboots?\b/,
  ],
};

const STYLE_PATTERNS: Readonly<Record<Style, readonly RegExp[]>> = {
  minimal: [/\bminimal(?:ist)?\b/],
  smart_casual: [/\bsmart[_ -]+casual\b/],
  relaxed: [/\brelaxed\b/],
};

const COLOR_PATTERNS = {
  black: [/\bblack\b/],
  white: [/\bwhite\b/],
  navy: [/\bnavy\b/],
  charcoal: [/\bcharcoal\b/],
  stone: [/\bstone\b/],
  olive: [/\bolive\b/],
  sage: [/\bsage\b/],
  cream: [/\bcream\b/],
  beige: [/\bbeige\b/],
  brown: [/\bbrown\b/],
  grey: [/\bgrey\b/],
  burgundy: [/\bburgundy\b/],
} as const satisfies Readonly<Record<ProductColor, readonly RegExp[]>>;

const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|above|system|developer)\s+(?:instructions?|messages?|prompts?)\b/,
  /\b(?:system|developer)\s+(?:prompt|message)\b/,
  /\b(?:call|invoke)\s+(?:the\s+)?(?:tool|function)\b/,
  /\b(?:bypass|disable)\s+(?:the\s+)?(?:validation|guard|safety|rules?)\b/,
  /\breveal\s+(?:the\s+)?(?:system prompt|developer message|secrets?)\b/,
] as const;

const NEGATED_COMMAND_PATTERNS = [
  /\b(?:do not|don't|dont|never)\s+(?:(?:want|wish|mean|intend)\s+to\s+)?(?:generate|build|create|recommend|show|find|replace|swap|switch|change|make|set|update|raise|increase|add|lower|reduce|decrease|cut|prefer|favour|favor|use|exclude|avoid|select|choose|pick|checkout|check out|proceed|continue|buy|purchase|pay)\b/,
  /\b(?:can't|cant|cannot|won't|wont|shouldn't|shouldnt)\s+(?:generate|build|create|recommend|show|find|replace|swap|switch|change|make|set|update|raise|increase|add|lower|reduce|decrease|cut|prefer|favour|favor|use|exclude|avoid|select|choose|pick|checkout|check out|proceed|continue|buy|purchase|pay)\b/,
  /\bnot\s+ready\s+(?:to|for)\s+(?:generate|build|create|recommend|show|find|replace|swap|switch|change|make|set|update|raise|increase|add|lower|reduce|decrease|cut|prefer|favour|favor|use|exclude|avoid|select|choose|pick|checkout|check out|proceed|continue|buy|purchase|pay)\b/,
  /\b(?:but\s+not|not)\s+(?:cheaper|more affordable|less expensive|minimal|minimalist|smart[_ -]+casual|relaxed|black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy)\b/,
  /\b(?:except|other than)\s+(?:black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy|minimal|minimalist|smart[_ -]+casual|relaxed|top|shirt|bottoms?|pants?|trousers?|shoes?|footwear)\b/,
] as const;

const META_COMMAND_PATTERNS = [
  /"[^"]*\b(?:generate|replace|swap|change|make|prefer|use|exclude|avoid|select|choose|checkout|check out)\b[^"]*"/,
  /(?:^|[^\p{L}\p{N}])'[^']*\b(?:generate|replace|swap|change|make|prefer|use|exclude|avoid|select|choose|checkout|check out)\b[^']*'(?![\p{L}\p{N}])/u,
  /\bwhat\s+does\b[^?]{0,80}\bmean\b/,
  /\b(?:explain|define)\b[^.!?]{0,40}\b(?:command|phrase|request)\b/,
  /\b(?:meaning|definition)\s+of\b[^.!?]{0,48}/,
] as const;

export const RULE_SAFETY_MARKERS = [
  "PROMPT_INJECTION",
  "NEGATED_COMMAND",
  "META_COMMAND",
] as const;

export type RuleSafetyMarker = (typeof RULE_SAFETY_MARKERS)[number];

const GENERATE_PATTERNS = [
  /\b(?:generate|build|create|recommend)\s+(?:(?:me|some|three|3|new|complete)\s+)*(?:outfits?|looks?)\b/,
  /\bshow\s+me\s+(?:(?:some|three|3|new|more)\s+)*(?:outfits?|looks?)\b/,
  /\bfind\s+me\s+(?:(?:an?|some|three|3)\s+)*(?:outfits?|looks?)\b/,
] as const;

const PREFER_CUE = /\b(?:prefer|favour|favor)\b|\buse\s+(?:more\s+)?(?:black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy)\b/;
const EXCLUDE_CUE = /\b(?:exclude|avoid)\b|\b(?:without|no)\s+(?:more\s+)?(?:black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy)\b/;
const SELECT_CUE = /\b(?:select|choose|pick)\b(?:\s+(?:the|an?|my))?(?:\s+(?:outfit|look|option))?/;
const CHECKOUT_CUE = /\b(?:checkout|check out)\b|\b(?:proceed|continue|go)\s+to\s+(?:checkout|payment)\b|\b(?:buy|purchase|pay for)\s+(?:this|the|my|selected)\s+(?:outfit|look)\b/;
const HELP_CUE = /\bhelp\b|\bwhat\s+(?:can|could)\s+(?:you|i)\s+do\b|\bshow\s+(?:me\s+)?(?:the\s+)?commands\b/;
const EXPLICIT_STYLE_CUE = /\b(?:change|set|switch|update)\s+(?:(?:the|my)\s+)?(?:outfit\s+)?style\b|\bmake\s+(?:it|(?:this|the|my)\s+(?:outfit|look))\s+(?:more\s+)?(?:minimal|minimalist|smart[_ -]+casual|relaxed)\b/;
const BUDGET_CUE = /\b(?:set|change|update|raise|increase|add|lower|reduce|decrease|cut)\b[^.!?]{0,48}\bbudget\b|\bbudget\b[^.!?]{0,48}(?:\$|\busd\b|\bdollars?\b|\bto\b|\bby\b|\bat\b|\bof\b)/;
const CHEAPER_CUE = /\bmake\s+(?:it|(?:this|the|my)\s+(?:outfit|look))\s+(?:a\s+(?:little|bit)\s+)?(?:cheaper|more affordable|less expensive)\b|\b(?:cheaper|more affordable|less expensive|lower[ -]priced)\s+(?:outfit|look|option|one|top|shirt|bottoms?|pants?|trousers?|shoes?|footwear)\b|\b(?:top|shirt|bottoms?|pants?|trousers?|shoes?|footwear)\s+(?:cheaper|more affordable|less expensive)\b/;
const REPLACEMENT_CUE = /\b(?:replace|swap|switch out)\b|\bchange\s+(?:(?:the|my|this)\s+)?(?:top|shirt|blouse|tee|t[ -]?shirt|bottoms?|pants?|trousers?|skirt|shoes?|footwear|sneakers?|loafers?|boots?)\b/;
const CHEAPER_MODIFIER = /\b(?:cheaper|more affordable|less expensive|lower[ -]priced)\b/;

type ActionKind =
  | "generate"
  | "cheaper"
  | "style"
  | "budget"
  | "prefer"
  | "exclude"
  | "select"
  | "checkout"
  | "help";

type ParsedAmounts =
  | { status: "none" }
  | { status: "invalid" }
  | { status: "ambiguous" }
  | { status: "ok"; amountCents: number };

function unsupported(reason: UnsupportedReason): AgentIntent {
  return { type: "UNSUPPORTED", reason };
}

export function normalizeAgentText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPromptInjectionMarker(text: string): boolean {
  return matchesAny(normalizeAgentText(text), PROMPT_INJECTION_PATTERNS);
}

function isNegatedCommand(text: string): boolean {
  return matchesAny(text, NEGATED_COMMAND_PATTERNS);
}

function isMetaCommand(text: string): boolean {
  return matchesAny(text, META_COMMAND_PATTERNS);
}

export function findRuleSafetyMarker(
  userText: string,
): RuleSafetyMarker | null {
  const text = normalizeAgentText(userText);

  if (hasPromptInjectionMarker(text)) return "PROMPT_INJECTION";
  if (isNegatedCommand(text)) return "NEGATED_COMMAND";
  if (isMetaCommand(text)) return "META_COMMAND";

  return null;
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function matchedValues<T extends string>(
  text: string,
  values: readonly T[],
  patterns: Readonly<Record<T, readonly RegExp[]>>,
): T[] {
  return values.filter((value) => matchesAny(text, patterns[value]));
}

export function findCategoryEvidence(text: string): ProductCategory[] {
  return matchedValues(
    normalizeAgentText(text),
    PRODUCT_CATEGORIES,
    CATEGORY_PATTERNS,
  );
}

export function findStyleEvidence(text: string): Style[] {
  return matchedValues(normalizeAgentText(text), STYLES, STYLE_PATTERNS);
}

export function findColorEvidence(text: string): ProductColor[] {
  return matchedValues(
    normalizeAgentText(text),
    PRODUCT_COLORS,
    COLOR_PATTERNS,
  );
}

function replacementTargetSegment(userText: string): string {
  const text = normalizeAgentText(userText);
  const connector = /\b(?:with|for|to|in)\b(?<target>[^.!?]*)/.exec(text);

  return connector?.groups?.target?.trim() ?? "";
}

export function findReplacementTargetStyleEvidence(text: string): Style[] {
  return matchedValues(
    replacementTargetSegment(text),
    STYLES,
    STYLE_PATTERNS,
  );
}

export function findReplacementTargetColorEvidence(
  text: string,
): ProductColor[] {
  return matchedValues(
    replacementTargetSegment(text),
    PRODUCT_COLORS,
    COLOR_PATTERNS,
  );
}

export function hasReplacementCheaperEvidence(text: string): boolean {
  return CHEAPER_MODIFIER.test(replacementTargetSegment(text));
}

/** Convert a single USD token without floating-point arithmetic. */
export function parseDollarAmountToCents(value: string): number | null {
  const normalized = normalizeAgentText(value)
    .replace(/^usd\s*/, "")
    .replace(/^\$\s*/, "")
    .replace(/\s*(?:usd|dollars?)$/, "")
    .trim();

  if (
    !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)
  ) {
    return null;
  }

  const withoutCommas = normalized.replaceAll(",", "");
  const [wholeDollars, fractional = ""] = withoutCommas.split(".");
  const dollars = Number(wholeDollars);
  const cents = Number(fractional.padEnd(2, "0"));
  const amountCents = dollars * 100 + cents;

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > 1_000_000
  ) {
    return null;
  }

  return amountCents;
}

function trimTerminalSentencePunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/, "");
}

function extractCurrencyAmountTokens(text: string): string[] {
  const tokens: string[] = [];
  const currencyPattern =
    /(?:-?\s*\$\s*-?\s*\d\S*|\busd\s*-?\s*\d\S*|(?<![\p{L}\p{N}_])-?\s*\d\S*\s*(?:usd|dollars?)\b)/gu;

  for (const match of text.matchAll(currencyPattern)) {
    tokens.push(trimTerminalSentencePunctuation(match[0]));
  }

  return tokens;
}

function extractBudgetAmounts(text: string): ParsedAmounts {
  const candidates = extractCurrencyAmountTokens(text);

  if (candidates.length === 0) {
    const bareBudgetPattern =
      /\b(?:budget(?:\s+(?:is|to|at|of|by))?|(?:increase|raise|add|decrease|lower|reduce|cut)\s+(?:the\s+)?budget\s+by)\s+(-?\s*\S+)/g;

    for (const match of text.matchAll(bareBudgetPattern)) {
      candidates.push(trimTerminalSentencePunctuation(match[1]));
    }
  }

  if (candidates.length === 0) {
    return { status: "none" };
  }

  const parsed = candidates.map(parseDollarAmountToCents);
  if (parsed.some((amount) => amount === null)) {
    return { status: "invalid" };
  }

  const uniqueAmounts = [...new Set(parsed as number[])];
  if (uniqueAmounts.length !== 1) {
    return { status: "ambiguous" };
  }

  return { status: "ok", amountCents: uniqueAmounts[0] };
}

export function findDollarAmountEvidence(text: string): readonly number[] {
  const normalized = normalizeAgentText(text);
  const candidates = extractCurrencyAmountTokens(normalized);
  const bareBudget = normalized.match(
    /\b(?:budget(?:\s+(?:is|to|at|of|by))?|(?:increase|raise|add|decrease|lower|reduce|cut)\s+(?:the\s+)?budget\s+by)\s+(\S+)/,
  );
  const tokens =
    candidates.length > 0
      ? candidates
      : bareBudget?.[1]
        ? [trimTerminalSentencePunctuation(bareBudget[1])]
        : [];

  return [
    ...new Set(
      tokens
        .map(parseDollarAmountToCents)
        .filter((amount): amount is number => amount !== null),
    ),
  ];
}

function actionKinds(text: string): ActionKind[] {
  const kinds: ActionKind[] = [];

  if (matchesAny(text, GENERATE_PATTERNS)) kinds.push("generate");
  if (CHEAPER_CUE.test(text)) kinds.push("cheaper");
  if (EXPLICIT_STYLE_CUE.test(text)) kinds.push("style");
  if (BUDGET_CUE.test(text)) kinds.push("budget");
  if (PREFER_CUE.test(text)) kinds.push("prefer");
  if (EXCLUDE_CUE.test(text)) kinds.push("exclude");
  if (SELECT_CUE.test(text)) kinds.push("select");
  if (CHECKOUT_CUE.test(text)) kinds.push("checkout");
  if (HELP_CUE.test(text)) kinds.push("help");

  return kinds;
}

function parseReplacement(text: string): AgentIntent {
  const independentKinds = actionKinds(text).filter(
    (kind) => kind !== "cheaper",
  );

  if (independentKinds.length > 0) {
    return unsupported("MULTIPLE_ACTIONS");
  }

  const categories = matchedValues(
    text,
    PRODUCT_CATEGORIES,
    CATEGORY_PATTERNS,
  );
  if (categories.length === 0) return unsupported("MISSING_TARGET");
  if (categories.length > 1) return unsupported("MULTIPLE_ACTIONS");

  const styles = findReplacementTargetStyleEvidence(text);
  const colors = findReplacementTargetColorEvidence(text);
  if (styles.length > 1 || colors.length > 1) {
    return unsupported("AMBIGUOUS_TARGET");
  }

  return {
    type: "REPLACE_ITEM",
    category: categories[0],
    requireCheaper: hasReplacementCheaperEvidence(text),
    targetStyle: styles[0] ?? null,
    targetColor: colors[0] ?? null,
  };
}

function parseMakeCheaper(text: string): AgentIntent {
  const categories = matchedValues(
    text,
    PRODUCT_CATEGORIES,
    CATEGORY_PATTERNS,
  );
  if (categories.length > 1) return unsupported("AMBIGUOUS_TARGET");

  return { type: "MAKE_CHEAPER", category: categories[0] ?? null };
}

function parseStyleChange(text: string): AgentIntent {
  const styles = matchedValues(text, STYLES, STYLE_PATTERNS);
  if (styles.length === 0) {
    return /\bstyle\s+(?:to|as)\s+\S+/.test(text)
      ? unsupported("UNSUPPORTED_VALUE")
      : unsupported("MISSING_TARGET");
  }
  if (styles.length > 1) return unsupported("AMBIGUOUS_TARGET");

  return { type: "CHANGE_STYLE", style: styles[0] };
}

function parseBudgetChange(text: string): AgentIntent {
  const amounts = extractBudgetAmounts(text);
  if (amounts.status === "none") return unsupported("MISSING_AMOUNT");
  if (amounts.status === "invalid") return unsupported("INVALID_AMOUNT");
  if (amounts.status === "ambiguous") {
    return unsupported("AMBIGUOUS_AMOUNT");
  }

  let operation: ChangeBudgetOperation = "set";
  const decreaseCue = /\b(?:decrease|lower|reduce|cut)\b/;
  const increaseCue = /\b(?:increase|raise|add)\b/;
  const hasBy = /\bby\b/.test(text);
  const hasTo = /\b(?:to|at|of|is)\b/.test(text);

  if (decreaseCue.test(text)) {
    if (hasBy) operation = "decrease_by";
    else if (!hasTo) return unsupported("AMBIGUOUS_TARGET");
  } else if (increaseCue.test(text)) {
    if (hasBy) operation = "increase_by";
    else if (!hasTo) return unsupported("AMBIGUOUS_TARGET");
  }

  return { type: "CHANGE_BUDGET", operation, amountCents: amounts.amountCents };
}

function parseColorCommand(
  text: string,
  type: "PREFER_COLOR" | "EXCLUDE_COLOR",
): AgentIntent {
  const colors = matchedValues(text, PRODUCT_COLORS, COLOR_PATTERNS);
  if (colors.length === 0) {
    return /\b(?:prefer|favour|favor|exclude|avoid|without|no)\b\s+\S+/.test(
      text,
    )
      ? unsupported("UNSUPPORTED_VALUE")
      : unsupported("MISSING_TARGET");
  }
  if (colors.length > 1) return unsupported("AMBIGUOUS_TARGET");

  return { type, color: colors[0] };
}

export function findExplicitOutfitPositionEvidence(
  userText: string,
): Array<1 | 2 | 3> {
  const text = normalizeAgentText(userText);
  const positions: Array<1 | 2 | 3> = [];
  const evidence: ReadonlyArray<readonly [1 | 2 | 3, RegExp]> = [
    [
      1,
      /\b(?:outfit|look|option)\s*(?:#\s*)?(?:1|one)\b|\bfirst\s+(?:outfit|look|option)\b/,
    ],
    [
      2,
      /\b(?:outfit|look|option)\s*(?:#\s*)?(?:2|two)\b|\bsecond\s+(?:outfit|look|option)\b/,
    ],
    [
      3,
      /\b(?:outfit|look|option)\s*(?:#\s*)?(?:3|three)\b|\bthird\s+(?:outfit|look|option)\b/,
    ],
  ];

  for (const [position, pattern] of evidence) {
    if (pattern.test(text)) positions.push(position);
  }

  return positions;
}

export function hasExplicitOutfitPositionMention(userText: string): boolean {
  const text = normalizeAgentText(userText);

  return /\b(?:outfit|look|option)\s*(?:#\s*)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:outfit|look|option)\b/.test(
    text,
  );
}

export function findSelectionPositionEvidence(
  userText: string,
): Array<1 | 2 | 3> {
  const text = normalizeAgentText(userText);
  const selectionCue = /\b(?:select|choose|pick)\b/.exec(text);
  if (!selectionCue) return [];

  const positions = new Set(findExplicitOutfitPositionEvidence(text));
  const selectionClause = text.slice(selectionCue.index + selectionCue[0].length);
  const ordinalEvidence: ReadonlyArray<readonly [1 | 2 | 3, RegExp]> = [
    [1, /\bfirst\b(?!\s+(?:colou?r|item|piece|shoe|top|bottom|size)\b)/],
    [2, /\bsecond\b(?!\s+(?:colou?r|item|piece|shoe|top|bottom|size)\b)/],
    [3, /\bthird\b(?!\s+(?:colou?r|item|piece|shoe|top|bottom|size)\b)/],
  ];

  for (const [position, pattern] of ordinalEvidence) {
    if (pattern.test(selectionClause)) positions.add(position);
  }

  return [...positions];
}

function parseSelection(text: string): AgentIntent {
  const positions = new Set(findSelectionPositionEvidence(text));

  if (positions.size > 1) return unsupported("AMBIGUOUS_TARGET");
  if (
    /\b(?:outfit|look|option)\s*(?:#\s*)?(?:[4-9]|\d{2,}|four|five|six|seven|eight|nine|ten)\b|\b(?:fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:outfit|look|option)\b|\b(?:select|choose|pick)\s+(?:(?:the|an?|my)\s+)?(?:fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.test(
      text,
    )
  ) {
    return unsupported("UNSUPPORTED_VALUE");
  }

  return {
    type: "SELECT_OUTFIT",
    position: [...positions][0] ?? null,
  };
}

/**
 * Deterministic fallback precedence:
 * 1. reject prompt-injection markers;
 * 2. reject negated commands and quoted/meta discussion of commands;
 * 3. treat replace/swap as one action whose cheaper/style/colour phrases are
 *    modifiers (but reject any other action alongside it);
 * 4. reject every other multi-action request;
 * 5. parse one bounded command or return a typed unsupported reason.
 */
export function parseRuleIntent(userText: string): AgentIntent {
  const text = normalizeAgentText(userText);

  if (text.length === 0) return unsupported("UNRECOGNIZED_COMMAND");
  const safetyMarker = findRuleSafetyMarker(text);
  if (safetyMarker === "PROMPT_INJECTION") {
    return unsupported("PROMPT_INJECTION");
  }
  if (safetyMarker !== null) {
    return unsupported("UNRECOGNIZED_COMMAND");
  }
  if (
    hasExplicitOutfitPositionMention(text) &&
    !SELECT_CUE.test(text)
  ) {
    return unsupported("UNSUPPORTED_VALUE");
  }

  if (REPLACEMENT_CUE.test(text)) return parseReplacement(text);

  const kinds = actionKinds(text);
  if (kinds.length > 1) return unsupported("MULTIPLE_ACTIONS");
  if (kinds.length === 0) return unsupported("UNRECOGNIZED_COMMAND");

  switch (kinds[0]) {
    case "generate":
      return { type: "GENERATE_OUTFITS" };
    case "cheaper":
      return parseMakeCheaper(text);
    case "style":
      return parseStyleChange(text);
    case "budget":
      return parseBudgetChange(text);
    case "prefer":
      return parseColorCommand(text, "PREFER_COLOR");
    case "exclude":
      return parseColorCommand(text, "EXCLUDE_COLOR");
    case "select":
      return parseSelection(text);
    case "checkout":
      return { type: "REQUEST_CHECKOUT" };
    case "help":
      return { type: "HELP" };
  }
}
