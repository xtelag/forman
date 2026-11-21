import { globSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { resolveSystemTexts } from "@/shared/system-texts";

describe("product copy", () => {
  test("uses the approved neutral wording in default public messages", () => {
    const messages = resolveSystemTexts("en");
    expect(messages.navigationSave).toBe(
      "Answers are saved when moving between steps. Complete the form by clicking {submit} in the last step.",
    );
    expect(messages.copyError).toBe(
      "Could not copy the link. Copy the URL from the browser address bar instead.",
    );
  });

  test("keeps current documentation on Pages and Pipeline terminology", () => {
    const obsoleteProductCopy = /\bhosted[- ]sources?\b|\/sources\/\{[^}]+\}/i;
    const documentation = globSync(["*.md", "docs/**/*.md"]);
    expect(documentation.length).toBeGreaterThan(0);
    const violations = documentation.filter((file) =>
      obsoleteProductCopy.test(readFileSync(file, "utf8")),
    );

    expect(violations).toEqual([]);
  });
});
