import { describe, expect, test } from "vitest";

import { compileSourceFields } from "@/server/sources/source-fields";

describe("compileSourceFields", () => {
  test("normalizes browser text and rejects unknown JSON Lines fields", () => {
    const fields = compileSourceFields("json-schema", '{"type":"object","properties":{"email":{"type":"string","format":"email","minLength":5,"maxLength":254},"score":{"type":"number"},"completed":{"type":"boolean"}},"required":["email"],"additionalProperties":false}');

    expect(fields.parse({ email: "john.forman@example.com", score: "24", completed: "true" })).toEqual({
      email: "john.forman@example.com",
      score: 24,
      completed: true,
    });
    expect(fields.parse({ email: "john.forman@example.com", extra: "no" })).toBeNull();
  });

  test("uses JSON Schema required fields and rejects properties outside the schema", () => {
    const fields = compileSourceFields("json-schema", JSON.stringify({
      type: "object",
      properties: { email: { type: "string", format: "email" }, tags: { type: "array", items: { type: "string" } } },
      required: ["email"],
      additionalProperties: false,
    }));

    expect(fields.parse({ email: "john.forman@example.com", tags: ["sales"] })).toEqual({ email: "john.forman@example.com", tags: ["sales"] });
    expect(fields.parse({ tags: ["sales"] })).toBeNull();
    expect(fields.parse({ email: "john.forman@example.com", unexpected: "no" })).toBeNull();
  });

  test("identifies the JSON Lines row and rule that makes a field definition invalid", () => {
    expect(() => compileSourceFields("json-schema", '{"type":"object","properties":{"name":{"type":"string","minLength":"3","maxLength":100}},"required":["name"],"additionalProperties":false}')).toThrow("Source fields definition is invalid.");
  });
});
