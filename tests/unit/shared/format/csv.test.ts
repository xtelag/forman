import { describe, expect, test } from "vitest";

import { safeCsvCell } from "@/shared/format/csv";

describe("safeCsvCell", () => {
  test("neutralizes spreadsheet formula prefixes", () => {
    expect(safeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(safeCsvCell("+1+1")).toBe("'+1+1");
    expect(safeCsvCell("-1+1")).toBe("'-1+1");
    expect(safeCsvCell("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  test("keeps ordinary values unchanged", () => {
    expect(safeCsvCell("hello, world")).toBe("hello, world");
  });
});
