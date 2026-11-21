import { describe, expect, test } from "vitest";

import { highlightCode } from "@/server/presentation/code-highlighting";

describe("highlightCode", () => {
  test("returns themed token markup without exposing code as DOM", async () => {
    const result = await highlightCode('<form action="/submit">', "html");

    expect(result).toContain("<span");
    expect(result).toContain("&#x3C;");
    expect(result).not.toContain("<form action");
  });
});
