import { describe, expect, it } from "vitest";

import { AppError, toSafeError } from "@/lib/errors";

describe("safe application errors", () => {
  it("preserves an explicitly safe domain error", () => {
    expect(
      toSafeError(
        new AppError(
          "NO_OUTFIT_WITHIN_BUDGET",
          "No complete outfit fits this budget.",
          422,
        ),
      ),
    ).toEqual({
      code: "NO_OUTFIT_WITHIN_BUDGET",
      message: "No complete outfit fits this budget.",
      status: 422,
    });
  });

  it("does not expose unexpected error details", () => {
    expect(toSafeError(new Error("secret internal context"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      status: 500,
    });
  });
});

