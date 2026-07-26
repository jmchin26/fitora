import { parseRuleIntent } from "@/lib/agent/rules";

import {
  AgentProviderError,
  parseExplanationInput,
  parseInterpretInput,
  type AgentExplanationInput,
  type AgentExplanationSelection,
  type AgentInterpretInput,
  type AgentProvider,
} from "./types";

export class RulesAgentProvider implements AgentProvider {
  readonly name = "rules" as const;

  async interpret(
    input: AgentInterpretInput,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (signal.aborted) {
      throw new AgentProviderError(
        this.name,
        "ABORTED",
        "The rules request was cancelled.",
      );
    }

    const parsedInput = parseInterpretInput(this.name, input);
    return parseRuleIntent(parsedInput.message);
  }

  async explain(
    input: AgentExplanationInput,
    signal: AbortSignal,
  ): Promise<AgentExplanationSelection> {
    if (signal.aborted) {
      throw new AgentProviderError(
        this.name,
        "ABORTED",
        "The rules request was cancelled.",
      );
    }

    const parsedInput = parseExplanationInput(this.name, input);

    return {
      sentenceIds: parsedInput.sentences
        .slice(0, parsedInput.maxSentences)
        .map((sentence) => sentence.id),
    };
  }
}

export function createRulesProvider(): AgentProvider {
  return new RulesAgentProvider();
}
