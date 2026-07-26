import { createHmac } from "node:crypto";

import { z } from "zod";

const NormalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

const SigningSecretSchema = z
  .string()
  .min(32)
  .max(4_096)
  .refine((value) => value === value.trim(), {
    message: "The signing secret must not have surrounding whitespace.",
  });

const USER_ID_DOMAIN_SEPARATOR =
  "fitora:prava:user-id:v1\u0000";

export function normalizePravaUserEmail(email: unknown): string {
  const parsed = NormalizedEmailSchema.safeParse(email);

  if (!parsed.success) {
    throw new Error("The Prava customer email is invalid.");
  }

  return parsed.data;
}

/**
 * Produces a stable, privacy-preserving Prava user_id. The normalized email is
 * required by Prava as user_email, but is never reused as the externally
 * visible identifier and cannot be recovered from this HMAC digest.
 */
export function derivePravaUserId(
  email: unknown,
  signingSecret: unknown,
): string {
  const normalizedEmail = normalizePravaUserEmail(email);
  const secret = SigningSecretSchema.safeParse(signingSecret);

  if (!secret.success) {
    throw new Error("The Prava user identity configuration is invalid.");
  }

  const digest = createHmac("sha256", secret.data)
    .update(USER_ID_DOMAIN_SEPARATOR, "utf8")
    .update(normalizedEmail, "utf8")
    .digest("base64url");

  return `fitora_${digest}`;
}
