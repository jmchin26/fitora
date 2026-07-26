export const AI_PROVIDERS = ["rules", "gemini", "ollama"] as const;
export const PAYMENT_PROVIDERS = ["mock", "prava"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number] | "invalid";
export type PaymentProvider =
  | (typeof PAYMENT_PROVIDERS)[number]
  | "invalid";

export type ProviderModes = {
  ai: AiProvider;
  payment: PaymentProvider;
};

export function safeAiProvider(value = process.env.AI_PROVIDER): AiProvider {
  const candidate = value ?? "rules";

  return AI_PROVIDERS.includes(candidate as (typeof AI_PROVIDERS)[number])
    ? (candidate as (typeof AI_PROVIDERS)[number])
    : "invalid";
}

export function safePaymentProvider(
  value = process.env.PAYMENT_PROVIDER,
): PaymentProvider {
  const candidate = value ?? "mock";

  return PAYMENT_PROVIDERS.includes(
    candidate as (typeof PAYMENT_PROVIDERS)[number],
  )
    ? (candidate as (typeof PAYMENT_PROVIDERS)[number])
    : "invalid";
}

export function getProviderModes(): ProviderModes {
  return {
    ai: safeAiProvider(),
    payment: safePaymentProvider(),
  };
}

export function providerModeLabels(modes: ProviderModes): readonly string[] {
  const aiLabels: Record<AiProvider, string> = {
    rules: "Rules fallback",
    gemini: "Gemini",
    ollama: "Local Ollama",
    invalid: "Invalid AI configuration",
  };
  const paymentLabels: Record<PaymentProvider, string> = {
    mock: "Mock payment mode",
    prava: "Prava sandbox",
    invalid: "Invalid payment configuration",
  };

  return [aiLabels[modes.ai], paymentLabels[modes.payment]];
}
