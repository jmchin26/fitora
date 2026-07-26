import type { AgentIntent } from "@/lib/agent/intent-schema";
import type {
  AgentEvent,
  AgentResponseState,
} from "@/lib/agent/contracts";
import { formatUsd } from "@/lib/money";

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function resultCountMessage(state: AgentResponseState): string {
  if (state.outfits.length === 0) {
    const suggestion = state.diagnostics?.suggestions[0];

    return suggestion
      ? `That verified change leaves no complete outfit. ${suggestion}`
      : "That verified change leaves no complete outfit. Adjust one preference and try again.";
  }

  const count = ["No", "One", "Two", "Three"][state.outfits.length];
  const noun = state.outfits.length === 1 ? "look is" : "looks are";

  return `${count} updated verified ${noun} ready. Choose a look again before checkout.`;
}

function updatedMessage(
  event: Extract<AgentEvent, { type: "OUTFITS_UPDATED" }>,
  state: AgentResponseState,
): string {
  const prefix: Record<typeof event.reason, string> = {
    generate: "I rebuilt your options from the current verified preferences.",
    change_style: `Style is now ${humanize(state.preferences.style)}.`,
    change_budget: `The total budget is now ${formatUsd(state.preferences.budgetCents)}.`,
    prefer_color: "Your preferred colours are updated.",
    exclude_color: "Your avoided colours are updated as hard filters.",
  };

  return `${prefix[event.reason]} ${resultCountMessage(state)}`;
}

function noChangeMessage(
  event: Extract<AgentEvent, { type: "NO_CHANGE" }>,
  intent: AgentIntent,
): string {
  if (event.reason === "help") {
    return "Try one change at a time: replace an item, make a look cheaper, change style or budget, prefer or avoid a colour, select a look, or request checkout review.";
  }

  if (event.reason === "selection_required") {
    return "Select one verified look before requesting checkout review. No payment session was created.";
  }

  if (event.reason === "missing_target") {
    return "Name the look or item you want to change so I can apply one verified action.";
  }

  if (event.reason === "invalid_budget") {
    return "That budget change would not leave a positive USD budget, so nothing changed.";
  }

  if (event.reason === "no_valid_revision") {
    return "No in-stock replacement satisfies every current size, colour, merchant, and budget constraint, so the verified look is unchanged.";
  }

  const reason = intent.type === "UNSUPPORTED" ? intent.reason : "UNRECOGNIZED_COMMAND";

  return `I did not change the verified state (${humanize(reason).toLowerCase()}). Try one supported revision at a time.`;
}

export function buildAgentMessage(
  event: AgentEvent,
  intent: AgentIntent,
  state: AgentResponseState,
): string {
  if (event.type === "OUTFITS_UPDATED") {
    return updatedMessage(event, state);
  }

  if (event.type === "ITEM_REPLACED") {
    const outfit = state.outfits[event.outfitIndex];
    const item = outfit?.[event.category];

    return item
      ? `I replaced the ${event.category} with ${item.product.name}. The verified outfit total is ${formatUsd(outfit.totalCents)}; select the updated look again before checkout.`
      : "The requested replacement could not be displayed, so no verified selection was made.";
  }

  if (event.type === "OUTFIT_SELECTED") {
    return `Look ${event.outfitIndex + 1} is selected. Prices, sizes, stock, and total will be checked again before checkout.`;
  }

  if (event.type === "CHECKOUT_REVIEW_READY") {
    return `Look ${event.outfitIndex + 1} is ready for order review. No payment session has been created.`;
  }

  return noChangeMessage(event, intent);
}
