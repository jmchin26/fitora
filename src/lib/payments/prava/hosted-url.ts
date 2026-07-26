import { z } from "zod";

import {
  PRAVA_PRODUCTION_HOSTED_ORIGIN,
  PRAVA_PRODUCTION_ORIGIN,
  PRAVA_SANDBOX_HOSTED_ORIGIN,
  PRAVA_SANDBOX_ORIGIN,
} from "@/lib/payments/prava/contracts";

export const PRAVA_ENVIRONMENTS = ["sandbox", "production"] as const;
export type PravaEnvironment =
  (typeof PRAVA_ENVIRONMENTS)[number];

const PravaSessionTokenSchema = z
  .string()
  .min(8)
  .max(4_096)
  .regex(/^[A-Za-z0-9._~-]+$/);

function normalizedOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function resolvePravaEnvironment(
  apiOrigin: unknown,
): PravaEnvironment {
  const origin = normalizedOrigin(apiOrigin);

  if (origin === PRAVA_SANDBOX_ORIGIN) {
    return "sandbox";
  }

  if (origin === PRAVA_PRODUCTION_ORIGIN) {
    return "production";
  }

  throw new Error("The Prava API origin is invalid.");
}

/**
 * Live hosted-mode docs require session_token as a query parameter even though
 * the REST walkthrough also describes iframe_url as directly openable. We
 * follow the explicit Integration Modes snippet: preserve Prava's returned URL
 * and set (replace, never duplicate) the exact returned token. The token is
 * intentionally returned only inside this redirect URL and must not be logged
 * or persisted separately.
 */
export function buildPravaHostedCheckoutUrl(
  iframeUrl: unknown,
  sessionToken: unknown,
  environment: PravaEnvironment,
): string {
  const token = PravaSessionTokenSchema.safeParse(sessionToken);

  if (!token.success || !PRAVA_ENVIRONMENTS.includes(environment)) {
    throw new Error("The Prava hosted checkout response is invalid.");
  }

  let url: URL;

  try {
    url = new URL(String(iframeUrl));
  } catch {
    throw new Error("The Prava hosted checkout response is invalid.");
  }

  const expectedOrigin =
    environment === "sandbox"
      ? PRAVA_SANDBOX_HOSTED_ORIGIN
      : PRAVA_PRODUCTION_HOSTED_ORIGIN;

  if (
    url.protocol !== "https:" ||
    url.origin !== expectedOrigin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("The Prava hosted checkout response is invalid.");
  }

  url.searchParams.set("session_token", token.data);

  const hostedUrl = url.toString();

  if (hostedUrl.length > 8_192) {
    throw new Error("The Prava hosted checkout response is invalid.");
  }

  return hostedUrl;
}
