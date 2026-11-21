import { describe, expect, test } from "vitest";

import { formatStartupFailure, isDebugMode } from "@/server/startup/failure-reporting";

describe("startup failure reporting", () => {
  test("reports a concise error by default", () => {
    expect(isDebugMode(undefined)).toBe(false);
    expect(formatStartupFailure(new Error("Invalid configuration"))).toBe(
      "× Failed to start: Invalid configuration",
    );
  });

  test("enables stack traces only with the explicit debug flag", () => {
    expect(isDebugMode("true")).toBe(true);
    expect(isDebugMode("false")).toBe(false);
  });
});
