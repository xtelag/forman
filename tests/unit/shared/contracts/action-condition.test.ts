import { describe, expect, test } from "vitest";

import { matchesActionCondition } from "@/shared/contracts/action-condition";

describe("action conditions", () => {
  test("matches configured rules against an Action input payload", () => {
    expect(
      matchesActionCondition(
        { email: "ada@example.test", verified: true },
        { conditions: [{ field: "verified", operator: "equals", value: "true" }], mode: "all" },
      ),
    ).toBe(true);
  });
});
