import { describe, expect, it } from "vitest";

import { guardCheckoutPostRequest } from "@/lib/checkout/request-guard";

function guardedRequest(
  headers: Record<string, string> = {},
): Pick<Request, "headers"> {
  return { headers: new Headers(headers) };
}

const testOptions = {
  appOrigin: "https://fitora.example",
  nodeEnv: "test",
} as const;

describe("checkout POST request guard", () => {
  it("accepts same-origin JSON with media-type parameters", () => {
    expect(
      guardCheckoutPostRequest(
        guardedRequest({
          "Content-Type": "application/json; charset=UTF-8",
          Origin: "https://fitora.example",
        }),
        testOptions,
      ),
    ).toEqual({ ok: true });
  });

  it.each([undefined, "text/plain", "application/problem+json"])(
    "rejects unsupported content type %j",
    (contentType) => {
      expect(
        guardCheckoutPostRequest(
          guardedRequest({
            ...(contentType ? { "Content-Type": contentType } : {}),
            Origin: "https://fitora.example",
          }),
          testOptions,
        ),
      ).toMatchObject({
        ok: false,
        status: 415,
        error: { code: "INVALID_CONTENT_TYPE" },
      });
    },
  );

  it.each([
    "https://shop.fitora.example",
    "https://fitora.example.attacker.test",
    "http://fitora.example",
    "null",
  ])("rejects non-matching supplied Origin %j", (origin) => {
    expect(
      guardCheckoutPostRequest(
        guardedRequest({
          "Content-Type": "application/json",
          Origin: origin,
        }),
        testOptions,
      ),
    ).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "INVALID_REQUEST_ORIGIN" },
    });
  });

  it("accepts omitted Origin only outside production", () => {
    const directRequest = guardedRequest({
      "Content-Type": "application/json",
    });

    expect(
      guardCheckoutPostRequest(directRequest, testOptions),
    ).toEqual({ ok: true });
    expect(
      guardCheckoutPostRequest(directRequest, {
        ...testOptions,
        nodeEnv: "production",
      }),
    ).toMatchObject({
      ok: false,
      status: 403,
      error: { code: "INVALID_REQUEST_ORIGIN" },
    });
  });
});
