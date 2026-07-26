import { describe, expect, it } from "vitest";

import {
  CheckoutApprovalRequestSchema,
  CheckoutReviewRequestSchema,
  CheckoutSessionStartedSchema,
  MockFinalizeRequestSchema,
} from "@/lib/checkout/api-contracts";

const reference = {
  top: { productId: "top-01", selectedSize: "M" },
  bottom: { productId: "bottom-01", selectedSize: "M" },
  shoes: { productId: "shoes-01", selectedSize: "42" },
};
const reviewId = "50000000-0000-4000-8000-000000000005";
const attemptId = "d0000000-0000-4000-8000-00000000000d";

describe("checkout API contracts", () => {
  it("accepts compact product references and rejects client commerce facts", () => {
    expect(
      CheckoutReviewRequestSchema.safeParse({ outfit: reference }).success,
    ).toBe(true);
    expect(
      CheckoutReviewRequestSchema.safeParse({
        outfit: { ...reference, totalCents: 1 },
      }).success,
    ).toBe(false);
  });

  it("binds approval to a review ID and rejects invalid or extra fields", () => {
    expect(
      CheckoutApprovalRequestSchema.parse({
        email: "  person@example.com ",
        attemptId,
        reviewId,
      }),
    ).toEqual({ attemptId, email: "person@example.com", reviewId });
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "not-an-email",
        attemptId,
        reviewId,
      }).success,
    ).toBe(false);
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "person@example.com",
        attemptId,
        reviewId: "not-a-review-id",
      }).success,
    ).toBe(false);
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "person@example.com",
        attemptId: "not-an-attempt-id",
        reviewId,
      }).success,
    ).toBe(false);
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "person@example.com",
        attemptId: attemptId.toUpperCase(),
        reviewId,
      }).success,
    ).toBe(false);
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "person@example.com",
        attemptId: "00000000-0000-0000-0000-000000000000",
        reviewId,
      }).success,
    ).toBe(false);
    expect(
      CheckoutApprovalRequestSchema.safeParse({
        email: "person@example.com",
        attemptId,
        reviewId,
        approved: true,
      }).success,
    ).toBe(false);
  });

  it("keeps mock decisions finite and separate from approval fields", () => {
    expect(
      MockFinalizeRequestSchema.safeParse({ decision: "approve" }).success,
    ).toBe(true);
    expect(
      MockFinalizeRequestSchema.safeParse({ decision: "pending" }).success,
    ).toBe(false);
    expect(
      MockFinalizeRequestSchema.safeParse({
        decision: "approve",
        paymentApproved: true,
      }).success,
    ).toBe(false);
  });

  it("couples mock to its local page and Prava to credential-free HTTPS URLs", () => {
    const base = {
      ok: true,
      provider: "mock",
      expiresAt: "2026-07-26T08:00:00.000Z",
    };

    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        hostedUrl: "/checkout/mock",
      }).success,
    ).toBe(true);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        provider: "prava",
        hostedUrl: "https://sandbox.example/hosted/session",
      }).success,
    ).toBe(true);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        hostedUrl: "https://sandbox.example/hosted/session",
      }).success,
    ).toBe(false);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        provider: "prava",
        hostedUrl: "/checkout/mock",
      }).success,
    ).toBe(false);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        hostedUrl: "http://payments.example/session",
      }).success,
    ).toBe(false);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        provider: "prava",
        hostedUrl: "https://user:secret@payments.example/session",
      }).success,
    ).toBe(false);
    expect(
      CheckoutSessionStartedSchema.safeParse({
        ...base,
        provider: "prava",
        hostedUrl: "https://payments.example/session#secret",
      }).success,
    ).toBe(false);
  });
});
