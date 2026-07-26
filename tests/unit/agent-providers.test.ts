import { describe, expect, it, vi } from "vitest";

import { resolveAgentProvider } from "@/lib/agent/providers/factory";
import { resolveOllamaChatUrl } from "@/lib/agent/providers/ollama";
import { createRulesProvider } from "@/lib/agent/providers/rules-provider";
import { AgentProviderError } from "@/lib/agent/providers/types";

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("rules agent provider", () => {
  it("wraps the deterministic rule parser", async () => {
    const provider = createRulesProvider();

    await expect(
      provider.interpret(
        { message: "Make the shoes cheaper" },
        activeSignal(),
      ),
    ).resolves.toEqual({ type: "MAKE_CHEAPER", category: "shoes" });
  });

  it("selects only supplied verified explanation sentence IDs", async () => {
    const provider = createRulesProvider();

    await expect(
      provider.explain(
        {
          sentences: [
            { id: "occasion", text: "This look suits a presentation." },
            { id: "budget", text: "The verified total is within budget." },
            { id: "stock", text: "All selected sizes are in stock." },
          ],
          maxSentences: 2,
        },
        activeSignal(),
      ),
    ).resolves.toEqual({ sentenceIds: ["occasion", "budget"] });
  });

  it("honours a caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createRulesProvider().interpret(
        { message: "Generate outfits" },
        controller.signal,
      ),
    ).rejects.toMatchObject({
      provider: "rules",
      reason: "ABORTED",
    });
  });
});

describe("agent provider factory", () => {
  it("resolves the explicit rules default", () => {
    const resolution = resolveAgentProvider({ environment: {} });

    expect(resolution).toMatchObject({
      status: "ready",
      configured: "rules",
    });
    expect(resolution.status === "ready" && resolution.provider.name).toBe(
      "rules",
    );
  });

  it("reports every missing Gemini setting without silently using rules", () => {
    expect(
      resolveAgentProvider({
        provider: "gemini",
        environment: {},
      }),
    ).toEqual({
      status: "unavailable",
      configured: "gemini",
      reason: "NOT_CONFIGURED",
      message:
        "gemini is selected, but GEMINI_API_KEY and GEMINI_MODEL are not configured.",
    });
  });

  it("reports invalid configured mode precisely", () => {
    expect(
      resolveAgentProvider({ provider: "gemini ", environment: {} }),
    ).toMatchObject({
      status: "invalid",
      configured: "invalid",
      requested: "gemini ",
      reason: "INVALID_CONFIGURATION",
    });
  });

  it("reports an invalid Ollama URL as configuration failure", () => {
    expect(
      resolveAgentProvider({
        provider: "ollama",
        ollamaBaseUrl: "file:///tmp/ollama",
        ollamaModel: "local-model",
        ollamaFetch: vi.fn(),
        environment: {},
      }),
    ).toMatchObject({
      status: "invalid",
      configured: "ollama",
      reason: "INVALID_CONFIGURATION",
    });
  });
});

describe("Ollama URL validation", () => {
  it("appends the native chat path to a validated base URL", () => {
    expect(resolveOllamaChatUrl("http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434/api/chat",
    );
    expect(resolveOllamaChatUrl("https://models.example.test/local/")).toBe(
      "https://models.example.test/local/api/chat",
    );
  });

  it.each([
    "ftp://127.0.0.1:11434",
    "http://user:password@127.0.0.1:11434",
    "http://127.0.0.1:11434?token=secret",
    "not a url",
  ])("rejects unsafe or invalid base URL %s", (baseUrl) => {
    expect(() => resolveOllamaChatUrl(baseUrl)).toThrow(
      AgentProviderError,
    );
  });
});
