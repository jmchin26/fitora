import { describe, expect, it, vi } from "vitest";

import {
  OpenAIAgentProvider,
  type OpenAIFetch,
} from "@/lib/agent/providers/openai";

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

function responseWithJson(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function output(text: string): unknown {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

describe("OpenAI agent provider", () => {
  it("uses the Responses API with strict structured output", async () => {
    const request = vi.fn<OpenAIFetch>(async () =>
      responseWithJson(
        output(JSON.stringify({ type: "CHANGE_STYLE", style: "relaxed" })),
      ),
    );
    const provider = new OpenAIAgentProvider({
      apiKey: "sk-test-openai-provider-placeholder",
      model: "gpt-5.6-luna",
      fetch: request,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret(
        { message: "Make it more relaxed" },
        activeSignal(),
      ),
    ).resolves.toEqual({ type: "CHANGE_STYLE", style: "relaxed" });

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/responses",
    );
    const init = request.mock.calls[0][1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "fitora_intent",
          strict: true,
        },
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(String((init?.headers as Record<string, string>).Authorization)).toBe(
      "Bearer sk-test-openai-provider-placeholder",
    );
  });

  it("retries at most once and accepts a valid second response", async () => {
    const request = vi
      .fn<OpenAIFetch>()
      .mockResolvedValueOnce(responseWithJson(output("not-json")))
      .mockResolvedValueOnce(
        responseWithJson(
          output(JSON.stringify({ type: "PREFER_COLOR", color: "navy" })),
        ),
      );
    const provider = new OpenAIAgentProvider({
      model: "gpt-5.6-luna",
      fetch: request,
    });

    await expect(
      provider.interpret({ message: "Use more navy" }, activeSignal()),
    ).resolves.toEqual({ type: "PREFER_COLOR", color: "navy" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects invented fields after structured generation", async () => {
    const request = vi.fn<OpenAIFetch>(async () =>
      responseWithJson(
        output(
          JSON.stringify({
            type: "REQUEST_CHECKOUT",
            paymentApproved: true,
          }),
        ),
      ),
    );
    const provider = new OpenAIAgentProvider({
      model: "gpt-5.6-luna",
      fetch: request,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret({ message: "Buy it" }, activeSignal()),
    ).rejects.toMatchObject({
      provider: "openai",
      reason: "INVALID_OUTPUT",
    });
  });

  it("times out when the transport ignores cancellation", async () => {
    const request = vi.fn<OpenAIFetch>(() => new Promise(() => undefined));
    const provider = new OpenAIAgentProvider({
      model: "gpt-5.6-luna",
      fetch: request,
      timeoutMs: 5,
      maxAttempts: 1,
    });

    await expect(
      provider.interpret({ message: "Use more navy" }, activeSignal()),
    ).rejects.toMatchObject({
      provider: "openai",
      reason: "TIMEOUT",
    });
  });
});
