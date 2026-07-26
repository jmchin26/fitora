import {
  createGeminiProvider,
  type GeminiContentClient,
} from "./gemini";
import { createOllamaProvider, type OllamaFetch } from "./ollama";
import { createRulesProvider } from "./rules-provider";
import {
  AGENT_PROVIDER_NAMES,
  AgentProviderError,
  type AgentProvider,
  type AgentProviderName,
} from "./types";

type AgentProviderEnvironment = Readonly<{
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}>;

export type AgentProviderFactoryOptions = {
  provider?: string;
  environment?: AgentProviderEnvironment;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  geminiClient?: GeminiContentClient;
  ollamaFetch?: OllamaFetch;
  timeoutMs?: number;
};

export type AgentProviderResolution =
  | {
      status: "ready";
      configured: AgentProviderName;
      provider: AgentProvider;
    }
  | {
      status: "unavailable";
      configured: AgentProviderName;
      reason: "NOT_CONFIGURED";
      message: string;
    }
  | {
      status: "invalid";
      configured: AgentProviderName | "invalid";
      requested: string;
      reason: "INVALID_CONFIGURATION";
      message: string;
    };

function unavailable(
  configured: AgentProviderName,
  missingVariables: readonly string[],
): AgentProviderResolution {
  const variables = missingVariables.join(" and ");

  return {
    status: "unavailable",
    configured,
    reason: "NOT_CONFIGURED",
    message: `${configured} is selected, but ${variables} ${
      missingVariables.length === 1 ? "is" : "are"
    } not configured.`,
  };
}

function invalid(
  configured: AgentProviderName | "invalid",
  requested: string,
  message: string,
): AgentProviderResolution {
  return {
    status: "invalid",
    configured,
    requested,
    reason: "INVALID_CONFIGURATION",
    message,
  };
}

function missing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function resolveAgentProvider(
  options: AgentProviderFactoryOptions = {},
): AgentProviderResolution {
  const environment = options.environment ?? process.env;
  const requested = options.provider ?? environment.AI_PROVIDER ?? "rules";

  if (
    !AGENT_PROVIDER_NAMES.includes(
      requested as (typeof AGENT_PROVIDER_NAMES)[number],
    )
  ) {
    return invalid(
      "invalid",
      requested,
      `AI_PROVIDER must be one of: ${AGENT_PROVIDER_NAMES.join(", ")}.`,
    );
  }

  const configured = requested as AgentProviderName;

  if (configured === "rules") {
    return {
      status: "ready",
      configured,
      provider: createRulesProvider(),
    };
  }

  try {
    if (configured === "gemini") {
      const apiKey = options.geminiApiKey ?? environment.GEMINI_API_KEY;
      const model = options.geminiModel ?? environment.GEMINI_MODEL;
      const missingVariables = [
        ...(!options.geminiClient && missing(apiKey)
          ? ["GEMINI_API_KEY"]
          : []),
        ...(missing(model) ? ["GEMINI_MODEL"] : []),
      ];

      if (missingVariables.length > 0) {
        return unavailable(configured, missingVariables);
      }

      return {
        status: "ready",
        configured,
        provider: createGeminiProvider({
          apiKey,
          model: model as string,
          client: options.geminiClient,
          timeoutMs: options.timeoutMs,
        }),
      };
    }

    const baseUrl = options.ollamaBaseUrl ?? environment.OLLAMA_BASE_URL;
    const model = options.ollamaModel ?? environment.OLLAMA_MODEL;
    const missingVariables = [
      ...(missing(baseUrl) ? ["OLLAMA_BASE_URL"] : []),
      ...(missing(model) ? ["OLLAMA_MODEL"] : []),
    ];

    if (missingVariables.length > 0) {
      return unavailable(configured, missingVariables);
    }

    return {
      status: "ready",
      configured,
      provider: createOllamaProvider({
        baseUrl: baseUrl as string,
        model: model as string,
        fetch: options.ollamaFetch,
        timeoutMs: options.timeoutMs,
      }),
    };
  } catch (error) {
    if (
      error instanceof AgentProviderError &&
      error.reason === "NOT_CONFIGURED"
    ) {
      return {
        status: "unavailable",
        configured,
        reason: "NOT_CONFIGURED",
        message: error.message,
      };
    }

    return invalid(
      configured,
      requested,
      error instanceof AgentProviderError
        ? error.message
        : `The ${configured} provider configuration is invalid.`,
    );
  }
}

export const createAgentProvider = resolveAgentProvider;
