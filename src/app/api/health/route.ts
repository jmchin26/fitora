import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function safeAiProvider(): "rules" | "gemini" | "ollama" | "invalid" {
  const value = process.env.AI_PROVIDER ?? "rules";

  return value === "rules" || value === "gemini" || value === "ollama"
    ? value
    : "invalid";
}

function safePaymentProvider(): "mock" | "prava" | "invalid" {
  const value = process.env.PAYMENT_PROVIDER ?? "mock";

  return value === "mock" || value === "prava" ? value : "invalid";
}

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "fitora",
      providers: {
        ai: safeAiProvider(),
        payment: safePaymentProvider(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

