import { expect, test } from "vitest";
import { createPageViewModel } from "@/server/pages/page-view-model";
import { compileSourceFields } from "@/server/sources/source-fields";
const source = '{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":30},"email":{"type":"string","maxLength":100}},"required":["name","email"],"additionalProperties":false}';
test("Source order defaults to a single form step", () => {
  expect(compileSourceFields("json-schema", source).parse({ name: "Ada", email: "ada@example.test" })).not.toBeNull();
  expect(createPageViewModel({ mode: "json-schema", source, presentation: null }).fields.map(field => field.page)).toEqual([1, 1]);
});

test("prefilling is explicit, typed and bounded; templates remain plain text", async () => {
  const { pageInitialAnswers, pageText } = await import("@/shared/page-form");
  const fields = createPageViewModel({ mode: "json-schema", source, presentation: { fields: [{ name: "name", defaultValue: "Default", queryParam: "who" }] } }).fields;
  expect(pageInitialAnswers(fields, new URLSearchParams("who=Ada&email=unmapped"))).toEqual({ name: "Ada" });
  expect(pageInitialAnswers(fields, new URLSearchParams(`who=${"x".repeat(31)}`))).toEqual({ name: "Default" });
  expect(pageText("Hello {{name}} {{missing}}", { name: "<script>alert(1)</script>" }, { missing: "Guest" })).toBe("Hello <script>alert(1)</script> Guest");
  const { pagePresentationSchema } = await import("@/shared/contracts/page");
  expect(pagePresentationSchema.safeParse({ logoUrl: "javascript:alert(1)" }).success).toBe(false);
  expect(pagePresentationSchema.safeParse({ theme: { text: "red;display:none" } }).success).toBe(false);
  expect(pagePresentationSchema.safeParse({ successUrl: "http://insecure.test" }).success).toBe(false);
});

test("explains length and numeric constraints in both Page languages", async () => {
  const { pageValueError, validPageValue } = await import("@/shared/page-form");
  const name = createPageViewModel({ mode: "json-schema", source, presentation: null }).fields.find(field => field.name === "name")!;
  expect(pageValueError({ ...name, minLength: 3 }, "A", "en")).toBe("Enter at least 3 characters.");
  expect(pageValueError(name, "x".repeat(31), "cs")).toBe("Maximální počet znaků: 30.");
  const amount = { ...name, valueType: "number" as const, htmlControl: "number" as const, minimum: 2, maximum: 10 };
  expect(pageValueError(amount, 1, "en")).toBe("Enter a number of at least 2.");
  expect(pageValueError(amount, 11, "cs")).toBe("Zadejte číslo nejvýše 10.");
  expect(pageValueError(amount, 5, "en")).toBeNull();
  expect(validPageValue(name, undefined, false)).toBe(true);
});
