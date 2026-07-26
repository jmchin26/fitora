import { NextResponse } from "next/server";

import { getProviderModes } from "@/lib/config/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "fitora",
      providers: getProviderModes(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
