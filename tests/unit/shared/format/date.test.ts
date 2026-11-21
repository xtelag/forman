import { afterEach, describe, expect, test, vi } from "vitest";

import { formatDateTime, parseDateInput } from "@/shared/format/date";

describe("parseDateInput", () => {
  afterEach(() => vi.restoreAllMocks());

  test("formats date-times as fixed ISO 8601 in the browser time zone", () => {
    const local = new Date(2026, 7, 9, 8, 3, 2, 452);
    expect(formatDateTime(local)).toBe("2026-08-09 08:03:02");
    expect(formatDateTime(local.toISOString())).toBe("2026-08-09 08:03:02");
  });

  test("uses UTC day boundaries and converts an inclusive end date to its exclusive boundary", () => {
    expect(parseDateInput("2026-01-02")?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(parseDateInput("2026-01-02", true)?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  test("rejects invalid dates", () => {
    expect(parseDateInput("2026-02-29")).toBeUndefined();
    expect(parseDateInput("January 2, 2026")).toBeUndefined();
  });
});
