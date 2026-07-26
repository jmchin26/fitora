import { describe, expect, it, vi } from "vitest";

import {
  GeminiAgentProvider,
  type GeminiContentClient,
} from "@/lib/agent/providers/gemini";

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

function fakeClient(
  implementation: GeminiContentClient["generateContent"],
): {
  client: GeminiContentClient;
  generateContent: ReturnType<
    typeof vi.fn<GeminiContentClient["generateContent"]>
  >;
} {
  const generateContent = vi.fn(implementation);
  return { client: { generateContent }, generateContent };
}

describe("Gemini agent provider", () => {
  it("uses structured JSON, deterministic settings, and the configured model", async () => {
    const fake = fakeClient(async () => ({
      text: JSON.stringify({ type: "CHANGE_STYLE", style: "relaxed" }),
    }));
    const provider = new GeminiAgentProvider({
      model: "configured-flash-model",
      client: fake.client,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret(
        { message: "Make it more relaxed" },
        activeSignal(),
      ),
    ).resolves.toEqual({ type: "CHANGE_STYLE", style: "relaxed" });

    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    const request = fake.generateContent.mock.calls[0][0];
    expect(request.model).toBe("configured-flash-model");
    expect(request.config).toMatchObject({
      temperature: 0,
      candidateCount: 1,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    });
    expect(request.config?.responseJsonSchema).toEqual(
      expect.objectContaining({ anyOf: expect.any(Array) }),
    );
    expect(request.config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("performs at most one retry and accepts the second valid result", async () => {
    const fake = fakeClient(
      vi
        .fn<GeminiContentClient["generateContent"]>()
        .mockResolvedValueOnce({ text: "not-json" })
        .mockResolvedValueOnce({
          text: JSON.stringify({ type: "PREFER_COLOR", color: "navy" }),
        }),
    );
    const provider = new GeminiAgentProvider({
      model: "configured-model",
      client: fake.client,
    });

    await expect(
      provider.interpret({ message: "Use more navy" }, activeSignal()),
    ).resolves.toEqual({ type: "PREFER_COLOR", color: "navy" });
    expect(fake.generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([
    "not-json",
    JSON.stringify({ type: "CHANGE_STYLE", style: "invented" }),
    JSON.stringify({
      type: "REQUEST_CHECKOUT",
      paymentApproved: true,
    }),
  ])("rejects invalid JSON or intent schema output", async (text) => {
    const fake = fakeClient(async () => ({ text }));
    const provider = new GeminiAgentProvider({
      model: "configured-model",
      client: fake.client,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret({ message: "Do something" }, activeSignal()),
    ).rejects.toMatchObject({
      provider: "gemini",
      reason: "INVALID_OUTPUT",
    });
  });

  it("times out even when an injected client ignores the abort signal", async () => {
    const fake = fakeClient(
      () => new Promise(() => undefined),
    );
    const provider = new GeminiAgentProvider({
      model: "configured-model",
      client: fake.client,
      timeoutMs: 5,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret({ message: "Generate outfits" }, activeSignal()),
    ).rejects.toMatchObject({
      provider: "gemini",
      reason: "TIMEOUT",
    });
  });

  it("rejects explanation IDs that were not supplied as verified", async () => {
    const fake = fakeClient(async () => ({
      text: JSON.stringify({ sentenceIds: ["invented-fact"] }),
    }));
    const provider = new GeminiAgentProvider({
      model: "configured-model",
      client: fake.client,
      maxAttempts: 1,
    });

    await expect(
      provider.explain(
        {
          sentences: [
            { id: "verified-budget", text: "The total is within budget." },
          ],
        },
        activeSignal(),
      ),
    ).rejects.toMatchObject({
      reason: "INVALID_OUTPUT",
    });
  });
});
