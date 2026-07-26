import { describe, expect, it } from "vitest";

import { publicHostedCheckoutUrl } from "@/lib/checkout/hosted-url";

const origins = {
  appOrigin: "https://fitora.example",
  pravaOrigin: "https://sandbox.api.prava.space",
} as const;

describe("public hosted checkout URL", () => {
  it("converts only the same-origin mock page to a local URL", () => {
    expect(
      publicHostedCheckoutUrl({
        ...origins,
        provider: "mock",
        hostedUrl:
          "https://fitora.example/checkout/mock?sessionId=server-only",
      }),
    ).toBe("/checkout/mock");
    expect(
      publicHostedCheckoutUrl({
        ...origins,
        provider: "mock",
        hostedUrl: "https://attacker.example/checkout/mock",
      }),
    ).toBeUndefined();
  });

  it("pins Prava navigation to the configured HTTPS origin", () => {
    expect(
      publicHostedCheckoutUrl({
        ...origins,
        provider: "prava",
        hostedUrl:
          "https://sandbox.api.prava.space/hosted/session?token=opaque",
      }),
    ).toBe(
      "https://sandbox.api.prava.space/hosted/session?token=opaque",
    );
    expect(
      publicHostedCheckoutUrl({
        ...origins,
        provider: "prava",
        hostedUrl: "https://attacker.example/hosted/session",
      }),
    ).toBeUndefined();
    expect(
      publicHostedCheckoutUrl({
        ...origins,
        provider: "prava",
        hostedUrl:
          "https://sandbox.api.prava.space.attacker.example/hosted/session",
      }),
    ).toBeUndefined();
  });

  it("rejects credentials, fragments, and plaintext Prava URLs", () => {
    for (const hostedUrl of [
      "https://user:secret@sandbox.api.prava.space/hosted/session",
      "https://sandbox.api.prava.space/hosted/session#secret",
      "http://sandbox.api.prava.space/hosted/session",
    ]) {
      expect(
        publicHostedCheckoutUrl({
          ...origins,
          provider: "prava",
          hostedUrl,
        }),
      ).toBeUndefined();
    }
  });
});
