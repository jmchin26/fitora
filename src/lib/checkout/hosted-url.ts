import type { PaymentProviderName } from "@/lib/payments/types";

type PublicHostedCheckoutUrlInput = {
  provider: PaymentProviderName;
  hostedUrl: string;
  appOrigin: string;
  pravaOrigin: string;
};

function parseOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value);

    return url.origin === value ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts provider output into the only URL shape the browser may receive.
 * Mock navigation is always local; Prava navigation is pinned to the
 * configured HTTPS sandbox origin.
 */
export function publicHostedCheckoutUrl(
  input: PublicHostedCheckoutUrlInput,
): string | undefined {
  let hosted: URL;

  try {
    hosted = new URL(input.hostedUrl);
  } catch {
    return undefined;
  }

  if (hosted.username || hosted.password || hosted.hash) {
    return undefined;
  }

  if (input.provider === "mock") {
    const app = parseOrigin(input.appOrigin);

    if (
      !app ||
      hosted.origin !== app.origin ||
      hosted.pathname !== "/checkout/mock"
    ) {
      return undefined;
    }

    return "/checkout/mock";
  }

  const prava = parseOrigin(input.pravaOrigin);

  if (
    !prava ||
    prava.protocol !== "https:" ||
    hosted.protocol !== "https:" ||
    hosted.origin !== prava.origin
  ) {
    return undefined;
  }

  return hosted.toString();
}
