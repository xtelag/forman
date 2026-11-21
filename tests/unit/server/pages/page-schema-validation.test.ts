import type { SubmissionPayload } from "@/shared/contracts/submission";
import { expect, test } from "vitest";
import { createPageViewModel } from "@/server/pages/page-view-model";
import { compileSourceFields } from "@/server/sources/source-fields";
import { pageInitialAnswers, pageInputValue, validatePageAnswers } from "@/shared/page-form";

const source = JSON.stringify({ type: "object", properties: {
  email: { type: "string", format: "email" },
  count: { type: "integer", minimum: 1, multipleOf: 2 },
  name: { type: "string", maxLength: 1 },
}, required: ["email", "count"], additionalProperties: false });
const fields = createPageViewModel({ mode: "json-schema", source, presentation: { fields: [{ name: "email", textControl: "textarea" }] } }).fields;

test.each<SubmissionPayload>([
  { email: "bad", count: 2 },
  { email: "a@example.test", count: 2.5 },
  { email: "a@example.test", count: 3 },
  { email: "a@example.test", count: 2, name: "😀" },
  { email: "a@example.test", count: 2 },
])("matches endpoint schema validation for %j without changing answers", answers => {
  const before = structuredClone(answers);
  expect(validatePageAnswers(fields, answers, source).length === 0).toBe(compileSourceFields("json-schema", source).parse(answers) !== null);
  expect(answers).toEqual(before);
});

test("checks only current fields on Next and root constraints on Submit", () => {
  const schema = JSON.stringify({ type: "object", properties: { email: { type: "string" }, code: { type: "string" } }, required: ["email", "code"], dependencies: { email: ["code"] }, additionalProperties: false });
  const all = createPageViewModel({ mode: "json-schema", source: schema, presentation: null }).fields;
  expect(validatePageAnswers(all.slice(0, 1), { email: "hello" }, schema, false)).toEqual([]);
  expect(validatePageAnswers(all, { email: "hello" }, schema).length).toBeGreaterThan(0);
});

test("resolves shared schema references for step validation", () => {
  const schema = JSON.stringify({ type: "object", definitions: { even: { type: "integer", multipleOf: 2 } }, properties: { count: { $ref: "#/definitions/even" } }, additionalProperties: false });
  expect(validatePageAnswers(fields.filter(f => f.name === "count"), { count: 3 }, schema, false).length).toBeGreaterThan(0);
});

test("enforces cross-field conditions only on final submission", () => {
  const schema = JSON.stringify({ type: "object", properties: { kind: { type: "string" }, code: { type: "string" } }, if: { properties: { kind: { const: "business" } } }, then: { properties: { code: { pattern: "^B-" } } }, additionalProperties: false });
  const all = createPageViewModel({ mode: "json-schema", source: schema, presentation: null }).fields;
  const answers = { kind: "business", code: "personal" };
  expect(validatePageAnswers(all, answers, schema, false)).toEqual([]);
  expect(validatePageAnswers(all, answers, schema).map(issue => issue.name)).toContain("code");
  expect(compileSourceFields("json-schema", schema).parse(answers)).toBeNull();
});


test("prefilling respects Source rules even when presentation changes the control", () => {
  const configured = fields.map(field => field.name === "email" ? { ...field, defaultValue: "bad", queryParam: "email" } : field.name === "count" ? { ...field, defaultValue: 2.5, queryParam: "count" } : field);
  expect(pageInitialAnswers(configured, new URLSearchParams("email=bad&count=3"), source)).toEqual({});
  expect(pageInitialAnswers(configured, new URLSearchParams("email=a%40example.test&count=2"), source)).toEqual({ email: "a@example.test", count: 2 });
});


test("array controls preserve JSON arrays and reject malformed or nested input", () => {
  const source = JSON.stringify({type:"object", properties:{topics:{type:"array",items:{type:"string"},minItems:2}},additionalProperties:false});
  const fields = createPageViewModel({mode:"json-schema",source,presentation:null}).fields;
  expect(fields[0].valueType).toBe("array");
  expect(fields[0].htmlControl).toBe("textarea");
  expect(pageInputValue(fields[0], '["forms","surveys"]')).toEqual(["forms","surveys"]);
  expect(validatePageAnswers(fields, {topics:pageInputValue(fields[0], '["forms","surveys"]')!},source)).toEqual([]);
  expect(pageInputValue(fields[0], '["unfinished"')).toBeUndefined();
  expect(pageInputValue(fields[0], '{"nested":true}')).toBeUndefined();
  expect(pageInputValue(fields[0], '[["nested"]]')).toBeUndefined();
  expect(pageInputValue(fields[0], '[]')).toBeUndefined();
});
