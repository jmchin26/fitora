import { createHmac } from "node:crypto";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import { getCatalogue } from "@/lib/catalogue/repository";
import type { OutfitReference } from "@/lib/catalogue/schemas";
import {
  verifyCheckoutOrder,
  type VerifiedOrder,
} from "@/lib/checkout/order";
import {
  CHECKOUT_TOKEN_MAX_LENGTH,
  CheckoutTokenClaimsSchema,
  StrictTokenIssueError,
  compareCheckoutClaimsToOrder,
  issueCheckoutToken,
  signStrictClaims,
  verifyCheckoutToken,
  verifyCheckoutTokenForOrder,
  verifyStrictClaims,
} from "@/lib/checkout/token";

const VALID_REFERENCE: OutfitReference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};
const NOW = 1_800_000_000;
const JTI = "11111111-1111-4111-8111-111111111111";
const SECRET = "0123456789abcdef0123456789abcdef";
const WRONG_SECRET = "fedcba9876543210fedcba9876543210";

function verifiedOrder(): VerifiedOrder {
  const result = verifyCheckoutOrder({ outfit: VALID_REFERENCE });

  if (!result.ok) {
    throw new Error("Test fixture did not produce a verified order.");
  }

  return result.order;
}

function issue(order = verifiedOrder(), nowEpochSeconds = NOW): string {
  return issueCheckoutToken(order, SECRET, {
    nowEpochSeconds,
    jti: JTI,
  });
}

function signPayloadText(payloadText: string, secret = SECRET): string {
  const payload = Buffer.from(payloadText, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

describe("checkout HMAC token", () => {
  it("issues canonical short-lived claims from a verified order", () => {
    const order = verifiedOrder();
    const token = issue(order);
    const result = verifyCheckoutToken(token, SECRET, {
      nowEpochSeconds: NOW,
    });

    expect(result).toEqual({
      ok: true,
      claims: {
        version: "v1",
        type: "checkout",
        jti: JTI,
        iat: NOW,
        exp: NOW + 300,
        reference: VALID_REFERENCE,
        expectedTotalCents: order.totalCents,
        currency: "USD",
        merchantId: "fitora-demo",
      },
    });
    expect(token.split(".")).toHaveLength(2);
  });

  it("detects payload and signature tampering without returning the token", () => {
    const token = issue();
    const [payload, signature] = token.split(".");
    const rawClaims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    rawClaims.expectedTotalCents =
      Number(rawClaims.expectedTotalCents) + 1;
    const changedPayload = Buffer.from(
      JSON.stringify(rawClaims),
      "utf8",
    ).toString("base64url");
    const tamperedPayload = `${changedPayload}.${signature}`;
    const changedSignature = `${
      signature[0] === "A" ? "B" : "A"
    }${signature.slice(1)}`;
    const tamperedSignature = `${payload}.${changedSignature}`;

    for (const candidate of [tamperedPayload, tamperedSignature]) {
      const result = verifyCheckoutToken(candidate, SECRET, {
        nowEpochSeconds: NOW,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "TOKEN_INVALID" },
      });
      expect(JSON.stringify(result)).not.toContain(candidate);
    }
  });

  it("returns typed expired and future-issuance failures", () => {
    const expired = verifyCheckoutToken(issue(), SECRET, {
      nowEpochSeconds: NOW + 300,
    });
    const future = verifyCheckoutToken(issue(verifiedOrder(), NOW + 31), SECRET, {
      nowEpochSeconds: NOW,
    });

    expect(expired).toMatchObject({
      ok: false,
      error: { code: "TOKEN_EXPIRED" },
    });
    expect(future).toMatchObject({
      ok: false,
      error: { code: "TOKEN_NOT_YET_VALID" },
    });
  });

  it("rejects malformed, oversized, and incorrectly signed tokens", () => {
    const malformedSigned = signPayloadText("{not-json");

    expect(
      verifyCheckoutToken("not-a-token", SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyCheckoutToken(
        "x".repeat(CHECKOUT_TOKEN_MAX_LENGTH + 1),
        SECRET,
        { nowEpochSeconds: NOW },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyCheckoutToken(malformedSigned, SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyCheckoutToken(issue(), WRONG_SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
  });

  it("rejects a validly signed but non-canonical JSON encoding", () => {
    const order = verifiedOrder();
    const nonCanonicalClaims = {
      version: "v1",
      type: "checkout",
      jti: JTI,
      iat: NOW,
      exp: NOW + 300,
      reference: order.reference,
      expectedTotalCents: order.totalCents,
      currency: "USD",
      merchantId: "fitora-demo",
    };
    const token = signPayloadText(JSON.stringify(nonCanonicalClaims));

    expect(
      CheckoutTokenClaimsSchema.safeParse(nonCanonicalClaims).success,
    ).toBe(true);
    expect(
      verifyCheckoutToken(token, SECRET, { nowEpochSeconds: NOW }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
  });

  it("rejects alternate base64url encodings and extra signed claims", () => {
    const token = issue();
    const [payload] = token.split(".");
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const tokenWithPaddingPayload = `${payload}=.${createHmac(
      "sha256",
      SECRET,
    )
      .update(`${payload}=`)
      .digest("base64url")}`;
    const extraClaimToken = signPayloadText(
      JSON.stringify({ ...claims, paymentApproved: true }),
    );

    expect(
      verifyCheckoutToken(tokenWithPaddingPayload, SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
    expect(
      verifyCheckoutToken(extraClaimToken, SECRET, {
        nowEpochSeconds: NOW,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "TOKEN_INVALID" },
    });
  });

  it("requires a secret of at least 32 characters and valid issue inputs", () => {
    expect(() =>
      issueCheckoutToken(verifiedOrder(), "too-short", {
        nowEpochSeconds: NOW,
        jti: JTI,
      }),
    ).toThrowError(StrictTokenIssueError);
    expect(() =>
      issueCheckoutToken(verifiedOrder(), SECRET, {
        nowEpochSeconds: NOW,
        jti: "not-a-uuid",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_CLAIMS" }),
    );
  });

  it("detects a catalogue price change after token issuance", () => {
    const oldOrder = verifiedOrder();
    const token = issue(oldOrder);
    const repricedCatalogue = getCatalogue().map((product) =>
      product.id === "top-01"
        ? { ...product, priceCents: product.priceCents + 100 }
        : product,
    );
    const fresh = verifyCheckoutOrder(
      { outfit: VALID_REFERENCE },
      repricedCatalogue,
    );

    expect(fresh.ok).toBe(true);

    if (!fresh.ok) return;

    const verified = verifyCheckoutToken(token, SECRET, {
      nowEpochSeconds: NOW,
    });
    expect(verified.ok).toBe(true);

    if (!verified.ok) return;

    expect(
      compareCheckoutClaimsToOrder(verified.claims, fresh.order),
    ).toEqual({
      ok: false,
      error: {
        code: "CHECKOUT_ORDER_MISMATCH",
        reason: "TOTAL",
        message:
          "The checkout order has changed and must be reviewed again.",
      },
    });
    expect(
      verifyCheckoutTokenForOrder(
        token,
        fresh.order,
        SECRET,
        { nowEpochSeconds: NOW },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CHECKOUT_ORDER_MISMATCH",
        reason: "TOTAL",
      },
    });
  });

  it("exposes the same strict envelope for future server cookie claims", () => {
    const ResultClaimsSchema = z
      .object({
        version: z.literal("v1"),
        type: z.literal("result"),
        jti: z.string().uuid(),
        iat: z.number().int().nonnegative(),
        exp: z.number().int().positive(),
        status: z.enum(["approved", "declined"]),
      })
      .strict();
    const claims = {
      version: "v1" as const,
      type: "result" as const,
      jti: JTI,
      iat: NOW,
      exp: NOW + 120,
      status: "approved" as const,
    };
    const token = signStrictClaims(
      claims,
      ResultClaimsSchema,
      SECRET,
    );

    expect(
      verifyStrictClaims(token, ResultClaimsSchema, SECRET, {
        nowEpochSeconds: NOW,
        maxLifetimeSeconds: 120,
      }),
    ).toEqual({ ok: true, claims });
  });
});
