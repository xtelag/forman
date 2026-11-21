import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { altchaScriptUrl } from "@/shared/altcha-script";

describe("vendored ALTCHA browser component", () => {
  test("serves the exact pinned ALTCHA distribution", () => {
    expect(readFileSync("public/vendor/altcha/altcha.js")).toEqual(
      readFileSync("node_modules/altcha/dist/altcha.js"),
    );
  });

  test("uses only the local immutable ALTCHA path", () => {
    expect(altchaScriptUrl("https://forman.example.test/api/challenge/contact"))
      .toBe("https://forman.example.test/vendor/altcha/altcha.js");
  });
});
