import { afterEach, expect, test, vi } from "vitest";
import { localDateBoundary, localDateParameters } from "@/client/local-date-filters";
import { parseDateInput } from "@/shared/format/date";

const originalTZ = process.env.TZ;
afterEach(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; vi.restoreAllMocks(); });

test.each([
  ["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z", 23],
  ["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z", 25],
])("Prague calendar day %s includes the full DST day", (day, start, end, hours) => {
  process.env.TZ = "Europe/Prague";
  expect(localDateBoundary(day)).toBe(start);
  expect(localDateBoundary(day, true)).toBe(end);
  expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
  expect(parseDateInput(start)?.toISOString()).toBe(start);
  expect(parseDateInput(end, true)?.toISOString()).toBe(end);
});

test("converts a western time zone and preserves unrelated filters and existing instants", () => {
  process.env.TZ = "America/New_York";
  const original = new URLSearchParams("from=2026-09-16&to=2026-09-16&tagId=a&tagId=b");
  const result = localDateParameters(original);
  expect(result.get("from")).toBe("2026-09-16T04:00:00.000Z");
  expect(result.get("to")).toBe("2026-09-17T04:00:00.000Z");
  expect(result.getAll("tagId")).toEqual(["a", "b"]);
  expect(original.get("from")).toBe("2026-09-16");
  expect(localDateParameters(result).toString()).toBe(result.toString());
});

test("does not normalize invalid calendar dates or timestamps into valid filters", () => {
  expect(localDateBoundary("2026-02-30")).toBe("2026-02-30");
  expect(parseDateInput("2026-02-30T00:00:00.000Z")).toBeUndefined();
  expect(parseDateInput("2026-09-16T99:00:00.000Z")).toBeUndefined();
});
