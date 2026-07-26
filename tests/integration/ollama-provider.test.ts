import { describe, expect, it, vi } from "vitest";

import {
  OllamaAgentProvider,
  type OllamaFetch,
} from "@/lib/agent/providers/ollama";

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

describe("Ollama agent provider", () => {
  it("calls native chat with strict format and deterministic options", async () => {
    const fetchImplementation = vi.fn<OllamaFetch>(async () =>
      response({
        message: {
          role: "assistant",
          content: JSON.stringify({
            type: "REPLACE_ITEM",
            category: "shoes",
            requireCheaper: true,
            targetStyle: "relaxed",
            targetColor: null,
          }),
        },
        done: true,
      }),
    );
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-structured-model",
      fetch: fetchImplementation,
    });

    await expect(
      provider.interpret(
        { message: "Replace the shoes with cheaper relaxed ones" },
        activeSignal(),
      ),
    ).resolves.toEqual({
      type: "REPLACE_ITEM",
      category: "shoes",
      requireCheaper: true,
      targetStyle: "relaxed",
      targetColor: null,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "local-structured-model",
      stream: false,
      options: { temperature: 0, num_predict: 512 },
    });
    expect(body.format).toEqual(
      expect.objectContaining({ anyOf: expect.any(Array) }),
    );
  });

  it("rejects an invalid vendor envelope", async () => {
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-model",
      fetch: async () => response({ response: "legacy field" }),
    });

    await expect(
      provider.interpret({ message: "Help" }, activeSignal()),
    ).rejects.toMatchObject({
      provider: "ollama",
      reason: "INVALID_OUTPUT",
    });
  });

  it("rejects invalid JSON and schema inside the vendor envelope", async () => {
    const fetchImplementation = vi
      .fn<OllamaFetch>()
      .mockResolvedValueOnce(
        response({ message: { content: "not-json" }, done: true }),
      )
      .mockResolvedValueOnce(
        response({
          message: {
            content: JSON.stringify({ type: "HELP", extra: true }),
          },
          done: true,
        }),
      );
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-model",
      fetch: fetchImplementation,
    });

    await expect(
      provider.interpret({ message: "Help" }, activeSignal()),
    ).rejects.toMatchObject({ reason: "INVALID_OUTPUT" });
    await expect(
      provider.interpret({ message: "Help" }, activeSignal()),
    ).rejects.toMatchObject({ reason: "INVALID_OUTPUT" });
  });

  it("reports an unavailable HTTP endpoint without reading its body", async () => {
    const json = vi.fn(async () => ({ secret: "must-not-be-read" }));
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-model",
      fetch: async () => ({ ok: false, status: 503, json }),
    });

    await expect(
      provider.interpret({ message: "Help" }, activeSignal()),
    ).rejects.toMatchObject({
      reason: "UNAVAILABLE",
      message: "The Ollama provider returned HTTP 503.",
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("times out if a fetch implementation never settles", async () => {
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-model",
      timeoutMs: 5,
      fetch: () => new Promise(() => undefined),
    });

    await expect(
      provider.interpret({ message: "Help" }, activeSignal()),
    ).rejects.toMatchObject({
      reason: "TIMEOUT",
    });
  });

  it("validates explanation IDs against the supplied verified list", async () => {
    const provider = new OllamaAgentProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "local-model",
      fetch: async () =>
        response({
          message: {
            content: JSON.stringify({ sentenceIds: ["verified-fit"] }),
          },
          done: true,
        }),
    });

    await expect(
      provider.explain(
        {
          sentences: [
            { id: "verified-fit", text: "The requested sizes are in stock." },
          ],
        },
        activeSignal(),
      ),
    ).resolves.toEqual({ sentenceIds: ["verified-fit"] });
  });
});
