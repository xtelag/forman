import { describe, expect, test } from "vitest";

import { storedSubmissionPayloadSchema, submissionPayloadSchema } from "@/shared/contracts/submission";
import { isSafeSuccessUrl } from "@/shared/contracts/sources";

describe("submission payload contract", () => {
  test("preserves ordered text values including duplicates and empty strings", () => {
    const payload = submissionPayloadSchema.parse({
      email: ["first@example.test", "first@example.test", ""],
      topic: ["support"],
    });

    expect(payload).toEqual({
      email: ["first@example.test", "first@example.test", ""],
      topic: ["support"],
    });
  });

  test("rejects nested values", () => {
    expect(() => submissionPayloadSchema.parse({ nested: [{ value: "no" }] })).toThrow();
  });

  test("accepts flat scalar and array values while rejecting null and nested values", () => {
    expect(submissionPayloadSchema.parse({
      accepted: false,
      count: 0,
      email: "person@example.test",
      values: ["sources", 2, true],
    })).toEqual({
      accepted: false,
      count: 0,
      email: "person@example.test",
      values: ["sources", 2, true],
    });
    expect(() => submissionPayloadSchema.parse({ absent: null })).toThrow();
    expect(() => submissionPayloadSchema.parse({ nested: { value: "no" } })).toThrow();
    expect(() => submissionPayloadSchema.parse({ nestedArray: [["no"]] })).toThrow();
    expect(() => submissionPayloadSchema.parse({ emptyArray: [] })).toThrow();
    expect(() => submissionPayloadSchema.parse({ notANumber: Number.NaN })).toThrow();
    expect(storedSubmissionPayloadSchema.parse({
      accepted: false,
      count: 0,
      empty: "",
      email: "person@example.test",
      values: ["sources", 2, true],
    })).toEqual({
      accepted: false,
      count: 0,
      empty: "",
      email: "person@example.test",
      values: ["sources", 2, true],
    });
    expect(() => storedSubmissionPayloadSchema.parse({ absent: null })).toThrow();
    expect(() => storedSubmissionPayloadSchema.parse({ nested: { value: "no" } })).toThrow();
    expect(() => storedSubmissionPayloadSchema.parse({ nestedArray: [["no"]] })).toThrow();
    expect(() => storedSubmissionPayloadSchema.parse({ emptyArray: [] })).toThrow();
    expect(() => storedSubmissionPayloadSchema.parse({ notANumber: Number.NaN })).toThrow();
    expect(() => storedSubmissionPayloadSchema.parse({ infinity: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe("success URL policy", () => {
  test("accepts HTTPS and HTTP localhost only", () => {
    expect(isSafeSuccessUrl("https://example.test/thanks")).toBe(true);
    expect(isSafeSuccessUrl("http://localhost:3001/thanks")).toBe(true);
    expect(isSafeSuccessUrl("http://example.test/thanks")).toBe(false);
  });
});
