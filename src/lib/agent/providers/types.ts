import { z } from "zod";

import {
  AgentIntentSchema,
  CHANGE_BUDGET_OPERATIONS,
  UNSUPPORTED_REASONS,
} from "@/lib/agent/intent-schema";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_COLORS,
  STYLES,
} from "@/lib/catalogue/schemas";

export const AGENT_PROVIDER_NAMES = [
  "rules",
  "openai",
  "gemini",
  "ollama",
] as const;

export const AGENT_PROVIDER_FAILURE_REASONS = [
  "NOT_CONFIGURED",
  "INVALID_CONFIGURATION",
  "INVALID_INPUT",
  "TIMEOUT",
  "ABORTED",
  "UNAVAILABLE",
  "INVALID_OUTPUT",
] as const;

export type AgentProviderName = (typeof AGENT_PROVIDER_NAMES)[number];
export type AgentProviderFailureReason =
  (typeof AGENT_PROVIDER_FAILURE_REASONS)[number];

export const AgentInterpretInputSchema = z
  .object({
    message: z.string().trim().min(1).max(280),
    state: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const VerifiedExplanationSentenceSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(240),
  })
  .strict();

export const AgentExplanationInputSchema = z
  .object({
    sentences: z
      .array(VerifiedExplanationSentenceSchema)
      .min(1)
      .max(12),
    maxSentences: z.number().int().min(1).max(3).default(2),
  })
  .strict()
  .superRefine((input, context) => {
    const ids = input.sentences.map((sentence) => sentence.id);

    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Verified explanation sentence IDs must be unique.",
        path: ["sentences"],
      });
    }
  });

export const AgentExplanationSelectionSchema = z
  .object({
    sentenceIds: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
  })
  .strict()
  .superRefine((selection, context) => {
    if (new Set(selection.sentenceIds).size !== selection.sentenceIds.length) {
      context.addIssue({
        code: "custom",
        message: "Explanation sentence IDs must be unique.",
        path: ["sentenceIds"],
      });
    }
  });

export type AgentInterpretInput = z.infer<typeof AgentInterpretInputSchema>;
export type VerifiedExplanationSentence = z.infer<
  typeof VerifiedExplanationSentenceSchema
>;
export type AgentExplanationInput = z.input<
  typeof AgentExplanationInputSchema
>;
export type ParsedAgentExplanationInput = z.output<
  typeof AgentExplanationInputSchema
>;
export type AgentExplanationSelection = z.infer<
  typeof AgentExplanationSelectionSchema
>;

export interface AgentProvider {
  readonly name: AgentProviderName;
  interpret(input: AgentInterpretInput, signal: AbortSignal): Promise<unknown>;
  explain(
    input: AgentExplanationInput,
    signal: AbortSignal,
  ): Promise<AgentExplanationSelection>;
}

type JsonSchema = Readonly<Record<string, unknown>>;

function strictObjectSchema(
  properties: Readonly<Record<string, JsonSchema>>,
): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const nullableCategorySchema: JsonSchema = {
  anyOf: [
    { type: "string", enum: PRODUCT_CATEGORIES },
    { type: "null" },
  ],
};

const nullableStyleSchema: JsonSchema = {
  anyOf: [{ type: "string", enum: STYLES }, { type: "null" }],
};

const nullableColorSchema: JsonSchema = {
  anyOf: [{ type: "string", enum: PRODUCT_COLORS }, { type: "null" }],
};

/**
 * A provider-neutral JSON Schema subset accepted by both Gemini structured
 * output and Ollama's `format` field. Runtime Zod validation remains the
 * authority after generation.
 */
export const AGENT_INTENT_RESPONSE_JSON_SCHEMA: JsonSchema = {
  anyOf: [
    strictObjectSchema({
      type: { type: "string", enum: ["GENERATE_OUTFITS"] },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["REPLACE_ITEM"] },
      category: { type: "string", enum: PRODUCT_CATEGORIES },
      requireCheaper: { type: "boolean" },
      targetStyle: nullableStyleSchema,
      targetColor: nullableColorSchema,
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["MAKE_CHEAPER"] },
      category: nullableCategorySchema,
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["CHANGE_STYLE"] },
      style: { type: "string", enum: STYLES },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["CHANGE_BUDGET"] },
      operation: { type: "string", enum: CHANGE_BUDGET_OPERATIONS },
      amountCents: {
        type: "integer",
        minimum: 1,
        maximum: 1_000_000,
      },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["PREFER_COLOR"] },
      color: { type: "string", enum: PRODUCT_COLORS },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["EXCLUDE_COLOR"] },
      color: { type: "string", enum: PRODUCT_COLORS },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["SELECT_OUTFIT"] },
      position: {
        anyOf: [
          { type: "integer", enum: [1, 2, 3] },
          { type: "null" },
        ],
      },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["REQUEST_CHECKOUT"] },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["HELP"] },
    }),
    strictObjectSchema({
      type: { type: "string", enum: ["UNSUPPORTED"] },
      reason: { type: "string", enum: UNSUPPORTED_REASONS },
    }),
  ],
};

export function explanationSelectionJsonSchema(
  input: ParsedAgentExplanationInput,
): JsonSchema {
  return strictObjectSchema({
    sentenceIds: {
      type: "array",
      items: {
        type: "string",
        enum: input.sentences.map((sentence) => sentence.id),
      },
      minItems: 1,
      maxItems: input.maxSentences,
    },
  });
}

export class AgentProviderError extends Error {
  readonly provider: AgentProviderName;
  readonly reason: AgentProviderFailureReason;

  constructor(
    provider: AgentProviderName,
    reason: AgentProviderFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "AgentProviderError";
    this.provider = provider;
    this.reason = reason;
  }
}

export function parseInterpretInput(
  provider: AgentProviderName,
  input: AgentInterpretInput,
): AgentInterpretInput {
  const result = AgentInterpretInputSchema.safeParse(input);

  if (!result.success) {
    throw new AgentProviderError(
      provider,
      "INVALID_INPUT",
      "The agent interpretation input is invalid.",
    );
  }

  return result.data;
}

export function parseExplanationInput(
  provider: AgentProviderName,
  input: AgentExplanationInput,
): ParsedAgentExplanationInput {
  const result = AgentExplanationInputSchema.safeParse(input);

  if (!result.success) {
    throw new AgentProviderError(
      provider,
      "INVALID_INPUT",
      "The verified explanation input is invalid.",
    );
  }

  return result.data;
}

export function parseAgentIntentOutput(
  provider: AgentProviderName,
  rawText: string,
): unknown {
  if (rawText.length === 0 || rawText.length > 20_000) {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid intent.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid intent.",
    );
  }

  const result = AgentIntentSchema.safeParse(parsed);

  if (!result.success) {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid intent.",
    );
  }

  return result.data;
}

export function parseExplanationSelection(
  provider: AgentProviderName,
  rawText: string,
  input: ParsedAgentExplanationInput,
): AgentExplanationSelection {
  if (rawText.length === 0 || rawText.length > 8_000) {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid explanation selection.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid explanation selection.",
    );
  }

  const result = AgentExplanationSelectionSchema.safeParse(parsed);
  const allowedIds = new Set(input.sentences.map((sentence) => sentence.id));

  if (
    !result.success ||
    result.data.sentenceIds.length > input.maxSentences ||
    result.data.sentenceIds.some((id) => !allowedIds.has(id))
  ) {
    throw new AgentProviderError(
      provider,
      "INVALID_OUTPUT",
      "The agent provider returned an invalid explanation selection.",
    );
  }

  return result.data;
}

type TimedOperationOptions<T> = {
  provider: AgentProviderName;
  timeoutMs: number;
  signal: AbortSignal;
  operation: (signal: AbortSignal) => Promise<T>;
};

export async function runTimedProviderOperation<T>({
  provider,
  timeoutMs,
  signal,
  operation,
}: TimedOperationOptions<T>): Promise<T> {
  if (signal.aborted) {
    throw new AgentProviderError(
      provider,
      "ABORTED",
      `The ${provider} request was cancelled.`,
    );
  }

  const controller = new AbortController();
  let timedOut = false;

  const forwardAbort = () => {
    controller.abort();
  };

  signal.addEventListener("abort", forwardAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortPromise = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        const reason: AgentProviderFailureReason = timedOut
          ? "TIMEOUT"
          : "ABORTED";
        const message = timedOut
          ? `The ${provider} request timed out.`
          : `The ${provider} request was cancelled.`;

        reject(new AgentProviderError(provider, reason, message));
      },
      { once: true },
    );
  });

  try {
    return await Promise.race([operation(controller.signal), abortPromise]);
  } catch (error) {
    if (error instanceof AgentProviderError) {
      throw error;
    }

    if (timedOut) {
      throw new AgentProviderError(
        provider,
        "TIMEOUT",
        `The ${provider} request timed out.`,
      );
    }

    if (signal.aborted) {
      throw new AgentProviderError(
        provider,
        "ABORTED",
        `The ${provider} request was cancelled.`,
      );
    }

    throw new AgentProviderError(
      provider,
      "UNAVAILABLE",
      `The ${provider} provider is unavailable.`,
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forwardAbort);
  }
}
