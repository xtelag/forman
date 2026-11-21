import { expect, test } from "vitest";
import { PAGE_SIZES, parsePageSize } from "@/shared/pagination";

test("offers 10, 50 and 100 and defaults invalid sizes to 10", () => {
  expect(PAGE_SIZES).toEqual([10, 50, 100]);
  for (const size of PAGE_SIZES) {
    expect(parsePageSize(size)).toBe(size);
    expect(parsePageSize(String(size))).toBe(size);
  }
  for (const size of [undefined, "", 25, "25", 500, -1, NaN]) {
    expect(parsePageSize(size)).toBe(10);
  }
});
