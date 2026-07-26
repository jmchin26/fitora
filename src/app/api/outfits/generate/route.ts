import { NextResponse } from "next/server";

import { UserPreferencesSchema } from "@/lib/catalogue/schemas";
import { generateOutfits } from "@/lib/styling/generate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "The request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = UserPreferencesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PREFERENCES",
          message: "Review the highlighted outfit preferences and try again.",
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const result = generateOutfits(parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.diagnostics.code,
          message:
            result.diagnostics.code === "NO_OUTFIT_WITHIN_BUDGET"
              ? "No complete outfit fits this budget."
              : "No complete outfit matches every required preference.",
        },
        diagnostics: result.diagnostics,
      },
      { status: 422 },
    );
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

