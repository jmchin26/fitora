import { NextResponse } from "next/server";

import {
  AgentOrchestrationError,
  orchestrateAgent,
} from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function errorResponse(
  status: number,
  code:
    | "INVALID_JSON"
    | "INVALID_AGENT_REQUEST"
    | "AGENT_STATE_INVALID"
    | "AGENT_EXECUTION_FAILED",
  message: string,
  fields?: Record<string, string[]>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
      },
    },
    {
      status,
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }

  try {
    const response = await orchestrateAgent(body, {
      signal: request.signal,
    });

    return NextResponse.json(response, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof AgentOrchestrationError) {
      if (error.code === "INVALID_AGENT_REQUEST") {
        return errorResponse(
          400,
          error.code,
          error.message,
          error.fields,
        );
      }

      if (error.code === "AGENT_STATE_INVALID") {
        return errorResponse(409, error.code, error.message);
      }
    }

    return errorResponse(
      500,
      "AGENT_EXECUTION_FAILED",
      "Fitora could not complete this agent request.",
    );
  }
}
