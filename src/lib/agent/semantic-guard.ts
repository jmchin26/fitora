import type { AgentIntent } from "@/lib/agent/intent-schema";
import {
  findCategoryEvidence,
  findColorEvidence,
  findDollarAmountEvidence,
  findReplacementTargetColorEvidence,
  findReplacementTargetStyleEvidence,
  findRuleSafetyMarker,
  findSelectionPositionEvidence,
  findStyleEvidence,
  hasPromptInjectionMarker,
  hasExplicitOutfitPositionMention,
  hasReplacementCheaperEvidence,
  normalizeAgentText,
  parseRuleIntent,
} from "@/lib/agent/rules";

export const INTENT_EVIDENCE_ISSUE_CODES = [
  "MISSING_ACTION_EVIDENCE",
  "MISSING_PARAMETER_EVIDENCE",
  "AMBIGUOUS_PARAMETER_EVIDENCE",
  "CONTRADICTORY_EVIDENCE",
  "ACTION_FAMILY_MISMATCH",
  "PROMPT_INJECTION_EVIDENCE",
] as const;

export type IntentEvidenceIssueCode =
  (typeof INTENT_EVIDENCE_ISSUE_CODES)[number];

export type IntentEvidenceField =
  | "intent"
  | "category"
  | "requireCheaper"
  | "targetStyle"
  | "targetColor"
  | "style"
  | "operation"
  | "amountCents"
  | "color"
  | "position"
  | "checkout";

export type IntentEvidenceIssue = Readonly<{
  code: IntentEvidenceIssueCode;
  field: IntentEvidenceField;
  message: string;
}>;

export type IntentEvidenceResult =
  | Readonly<{ ok: true; intent: AgentIntent }>
  | Readonly<{
      ok: false;
      intent: AgentIntent;
      issues: readonly IntentEvidenceIssue[];
    }>;

function issue(
  issues: IntentEvidenceIssue[],
  code: IntentEvidenceIssueCode,
  field: IntentEvidenceField,
  message: string,
) {
  issues.push({ code, field, message });
}

function requireAction(
  matches: boolean,
  issues: IntentEvidenceIssue[],
  intentType: AgentIntent["type"],
) {
  if (!matches) {
    issue(
      issues,
      "MISSING_ACTION_EVIDENCE",
      "intent",
      `The user text does not support the ${intentType} action.`,
    );
  }
}

function verifySingleValue<T extends string>(
  evidence: readonly T[],
  expected: T,
  field: IntentEvidenceField,
  issues: IntentEvidenceIssue[],
) {
  if (evidence.length > 1) {
    issue(
      issues,
      "AMBIGUOUS_PARAMETER_EVIDENCE",
      field,
      `The user text contains more than one possible ${field}.`,
    );
    return;
  }

  if (evidence[0] !== expected) {
    issue(
      issues,
      "MISSING_PARAMETER_EVIDENCE",
      field,
      `The user text does not contain evidence for ${field}=${expected}.`,
    );
  }
}

/**
 * Rejects parameters that a model invented or resolved from hidden context.
 * The bounded rules parser supplies only safety boundaries, not the provider's
 * full vocabulary: a model cannot pick one action from multi-action,
 * injection, negated, or meta text, nor turn a clearly rules-supported command
 * into UNSUPPORTED. Ordinary rules misses still use the evidence checks below.
 * Ordinary evidence mismatches are data (`ok: false`), not exceptions, so the
 * orchestrator can fall back to rules without treating user input as a fault.
 */
export function guardIntentSemanticEvidence(
  userText: string,
  intent: AgentIntent,
): IntentEvidenceResult {
  const text = normalizeAgentText(userText);
  const issues: IntentEvidenceIssue[] = [];
  const rulesBaseline = parseRuleIntent(text);
  const safetyMarker = findRuleSafetyMarker(text);
  const rulesFoundSafetyBoundary =
    rulesBaseline.type === "UNSUPPORTED" &&
    (rulesBaseline.reason !== "UNRECOGNIZED_COMMAND" || safetyMarker !== null);
  const rulesFoundDifferentSupportedFamily =
    rulesBaseline.type !== "UNSUPPORTED" &&
    intent.type !== "UNSUPPORTED" &&
    rulesBaseline.type !== intent.type;

  if (
    (intent.type !== "UNSUPPORTED" && rulesFoundSafetyBoundary) ||
    (intent.type === "UNSUPPORTED" && rulesBaseline.type !== "UNSUPPORTED") ||
    rulesFoundDifferentSupportedFamily
  ) {
    issue(
      issues,
      "ACTION_FAMILY_MISMATCH",
      "intent",
      `The model action family does not match the bounded rules baseline (${rulesBaseline.type}).`,
    );
  }

  if (
    hasPromptInjectionMarker(text) &&
    !(intent.type === "UNSUPPORTED" && intent.reason === "PROMPT_INJECTION")
  ) {
    issue(
      issues,
      "PROMPT_INJECTION_EVIDENCE",
      "intent",
      "Prompt-injection markers cannot provide semantic command evidence.",
    );
  }

  if (
    intent.type !== "SELECT_OUTFIT" &&
    intent.type !== "UNSUPPORTED" &&
    hasExplicitOutfitPositionMention(text)
  ) {
    issue(
      issues,
      "ACTION_FAMILY_MISMATCH",
      "position",
      "This intent cannot target a numbered outfit; select it in a separate action first.",
    );
  }

  switch (intent.type) {
    case "GENERATE_OUTFITS":
      requireAction(
        /\b(?:generate|build|create|recommend)\b[^.!?]{0,40}\b(?:outfits?|looks?)\b|\b(?:show|find)\s+me\b[^.!?]{0,32}\b(?:outfits?|looks?)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      break;

    case "REPLACE_ITEM": {
      requireAction(
        /\b(?:replace|swap|switch out)\b|\bchange\b[^.!?]{0,28}\b(?:top|shirt|blouse|tee|bottoms?|pants?|trousers?|skirt|shoes?|footwear|sneakers?|loafers?|boots?)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      verifySingleValue(
        findCategoryEvidence(text),
        intent.category,
        "category",
        issues,
      );

      const cheaperEvidence = hasReplacementCheaperEvidence(text);
      if (intent.requireCheaper && !cheaperEvidence) {
        issue(
          issues,
          "MISSING_PARAMETER_EVIDENCE",
          "requireCheaper",
          "The user text does not ask for a cheaper replacement.",
        );
      } else if (!intent.requireCheaper && cheaperEvidence) {
        issue(
          issues,
          "CONTRADICTORY_EVIDENCE",
          "requireCheaper",
          "The user asks for a cheaper replacement but the intent omits it.",
        );
      }

      const styleEvidence = findReplacementTargetStyleEvidence(text);
      if (intent.targetStyle === null) {
        if (styleEvidence.length > 0) {
          issue(
            issues,
            "CONTRADICTORY_EVIDENCE",
            "targetStyle",
            "The user supplies a replacement style but the intent omits it.",
          );
        }
      } else {
        verifySingleValue(
          styleEvidence,
          intent.targetStyle,
          "targetStyle",
          issues,
        );
      }

      const colorEvidence = findReplacementTargetColorEvidence(text);
      if (intent.targetColor === null) {
        if (colorEvidence.length > 0) {
          issue(
            issues,
            "CONTRADICTORY_EVIDENCE",
            "targetColor",
            "The user supplies a replacement colour but the intent omits it.",
          );
        }
      } else {
        verifySingleValue(
          colorEvidence,
          intent.targetColor,
          "targetColor",
          issues,
        );
      }
      break;
    }

    case "MAKE_CHEAPER": {
      requireAction(
        /\b(?:cheaper|more affordable|less expensive|lower[ -]priced)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      const categoryEvidence = findCategoryEvidence(text);
      if (intent.category === null) {
        if (categoryEvidence.length > 0) {
          issue(
            issues,
            "CONTRADICTORY_EVIDENCE",
            "category",
            "The user names a category but the intent omits it.",
          );
        }
      } else {
        verifySingleValue(
          categoryEvidence,
          intent.category,
          "category",
          issues,
        );
      }
      break;
    }

    case "CHANGE_STYLE":
      requireAction(
        /\b(?:change|set|switch|update)\b[^.!?]{0,24}\bstyle\b|\bmake\s+(?:it|(?:this|the|my)\s+(?:outfit|look))\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      verifySingleValue(
        findStyleEvidence(text),
        intent.style,
        "style",
        issues,
      );
      break;

    case "CHANGE_BUDGET": {
      requireAction(/\bbudget\b/.test(text), issues, intent.type);
      const amounts = findDollarAmountEvidence(text);
      if (amounts.length > 1) {
        issue(
          issues,
          "AMBIGUOUS_PARAMETER_EVIDENCE",
          "amountCents",
          "The user text contains more than one dollar amount.",
        );
      } else if (amounts[0] !== intent.amountCents) {
        issue(
          issues,
          "MISSING_PARAMETER_EVIDENCE",
          "amountCents",
          `The user text does not contain evidence for amountCents=${intent.amountCents}.`,
        );
      }

      const operationEvidence =
        intent.operation === "increase_by"
          ? /\b(?:increase|raise|add)\b[^.!?]{0,48}\bbudget\b[^.!?]{0,24}\bby\b/.test(
              text,
            )
          : intent.operation === "decrease_by"
            ? /\b(?:decrease|lower|reduce|cut)\b[^.!?]{0,48}\bbudget\b[^.!?]{0,24}\bby\b/.test(
                text,
              )
            : /\bbudget\b/.test(text) &&
              !/\b(?:increase|raise|add|decrease|lower|reduce|cut)\b[^.!?]{0,48}\bbudget\b[^.!?]{0,24}\bby\b/.test(
                text,
              );

      if (!operationEvidence) {
        issue(
          issues,
          "MISSING_PARAMETER_EVIDENCE",
          "operation",
          `The user text does not contain evidence for operation=${intent.operation}.`,
        );
      }
      break;
    }

    case "PREFER_COLOR":
      requireAction(
        /\b(?:prefer|favour|favor)\b|\buse\s+(?:more\s+)?(?:black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      verifySingleValue(
        findColorEvidence(text),
        intent.color,
        "color",
        issues,
      );
      break;

    case "EXCLUDE_COLOR":
      requireAction(
        /\b(?:exclude|avoid|without)\b|\bno\s+(?:more\s+)?(?:black|white|navy|charcoal|stone|olive|sage|cream|beige|brown|grey|burgundy)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      verifySingleValue(
        findColorEvidence(text),
        intent.color,
        "color",
        issues,
      );
      break;

    case "SELECT_OUTFIT": {
      requireAction(
        /\b(?:select|choose|pick)\b/.test(text),
        issues,
        intent.type,
      );
      const positions = findSelectionPositionEvidence(text);
      if (intent.position === null) {
        if (positions.length > 0) {
          issue(
            issues,
            "CONTRADICTORY_EVIDENCE",
            "position",
            "The user names an outfit position but the intent omits it.",
          );
        }
      } else if (positions.length > 1) {
        issue(
          issues,
          "AMBIGUOUS_PARAMETER_EVIDENCE",
          "position",
          "The user text contains more than one outfit position.",
        );
      } else if (positions[0] !== intent.position) {
        issue(
          issues,
          "MISSING_PARAMETER_EVIDENCE",
          "position",
          `The user text does not contain evidence for position=${intent.position}.`,
        );
      }
      break;
    }

    case "REQUEST_CHECKOUT":
      requireAction(
        /\b(?:checkout|check out)\b|\b(?:proceed|continue|go)\s+to\s+(?:checkout|payment)\b|\b(?:buy|purchase|pay for)\s+(?:this|the|my|selected)\s+(?:outfit|look)\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      if (
        !/\b(?:checkout|check out)\b|\b(?:proceed|continue|go)\s+to\s+(?:checkout|payment)\b|\b(?:buy|purchase|pay for)\s+(?:this|the|my|selected)\s+(?:outfit|look)\b/.test(
          text,
        )
      ) {
        issue(
          issues,
          "MISSING_PARAMETER_EVIDENCE",
          "checkout",
          "The user text does not explicitly request checkout.",
        );
      }
      break;

    case "HELP":
      requireAction(
        /\bhelp\b|\bwhat\s+(?:can|could)\s+(?:you|i)\s+do\b|\bshow\s+(?:me\s+)?(?:the\s+)?commands\b/.test(
          text,
        ),
        issues,
        intent.type,
      );
      break;

    case "UNSUPPORTED":
      break;
  }

  return issues.length === 0
    ? { ok: true, intent }
    : { ok: false, intent, issues };
}
