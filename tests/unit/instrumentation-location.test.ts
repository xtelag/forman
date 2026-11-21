import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("Next instrumentation convention", () => {
  test("keeps server instrumentation next to the src application", () => {
    expect(existsSync(resolve(process.cwd(), "src/instrumentation.ts"))).toBe(true);
  });
});
