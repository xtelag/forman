import { describe, expect, test } from "vitest";

import {
  HONEYPOT_FIELD,
  InvalidBrowserSubmissionError,
  parseBrowserSubmission,
  validateSubmissionLimits,
} from "@/server/submissions/browser-submission-service";

describe("parseBrowserSubmission", () => {
  const noProtections = { altchaEnabled: false, honeypotEnabled: false };

  test.each([
    [noProtections, [["email", "a@example.test"]]],
    [{ altchaEnabled: false, honeypotEnabled: true }, [["email", "a@example.test"], [HONEYPOT_FIELD, ""]]],
    [{ altchaEnabled: true, honeypotEnabled: false }, [["email", "a@example.test"], ["altcha", "proof"]]],
    [{ altchaEnabled: true, honeypotEnabled: true }, [["email", "a@example.test"], [HONEYPOT_FIELD, ""], ["altcha", "proof"]]],
  ])("accepts exactly the enabled protection fields", (protections, entries) => {
    expect(() => parseBrowserSubmission(
      "application/x-www-form-urlencoded",
      new URLSearchParams(entries).toString(),
      protections,
    )).not.toThrow();
  });

  test("stores only the last duplicate user value while retaining all values for limits", () => {
    const body = new URLSearchParams([
      ["email", "first@example.test"],
      ["email", ""],
      [HONEYPOT_FIELD, ""],
      ["altcha", "proof"],
    ]);

    expect(parseBrowserSubmission("application/x-www-form-urlencoded", body.toString(), {
      altchaEnabled: true,
      honeypotEnabled: true,
    })).toEqual({
      altchaPayload: "proof",
      limitPayload: { email: ["first@example.test", ""] },
      payload: { email: "" },
    });
  });

  test.each([
    ["null", "null"],
    ["a nested object", '{"email":{"value":"a@example.test"}}'],
    ["an empty array", '{"topics":[]}'],
    ["a non-object root", '["a@example.test"]'],
    ["malformed JSON", '{"email":'],
  ])("rejects %s", (_label, body) => {
    expect(() => parseBrowserSubmission("application/json", body, noProtections)).toThrow(
      InvalidBrowserSubmissionError,
    );
  });

  test("rejects unsupported content and honeypot activity", () => {
    expect(() => parseBrowserSubmission("multipart/form-data", "", noProtections)).toThrow();
    expect(() =>
      parseBrowserSubmission(
        "application/x-www-form-urlencoded",
        new URLSearchParams([[HONEYPOT_FIELD, "bot"]]).toString(),
        { altchaEnabled: false, honeypotEnabled: true },
      ),
    ).toThrow();
  });
});

describe("validateSubmissionLimits", () => {
  const limits = {
    maxEntries: 3,
    maxKeyLength: 10,
    maxUniqueKeys: 2,
    maxValueLength: 10,
    maxValuesPerKey: 2,
  };

  test("accepts bounded scalar and array payloads", () => {
    expect(validateSubmissionLimits({ email: "a", topic: ["help", ""] }, limits)).toBe(true);
  });

  test("rejects excessive keys, values, and strings but not scalar number or boolean length", () => {
    expect(validateSubmissionLimits({ one: ["a"], two: ["b"], three: ["c"] }, limits)).toBe(
      false,
    );
    expect(validateSubmissionLimits({ email: ["a", "b", "c"] }, limits)).toBe(false);
    expect(validateSubmissionLimits({ verylongfield: ["a"] }, limits)).toBe(false);
    expect(validateSubmissionLimits({ email: "this string is too long" }, limits)).toBe(false);
    expect(validateSubmissionLimits({ email: 123_456_789_012_345, accepted: false }, limits)).toBe(true);
  });
});


describe("schema-aware HTML input", () => {
  const protections = {altchaEnabled:false,honeypotEnabled:false,fieldDefinitionMode:"json-schema" as const,fieldDefinitionSource:JSON.stringify({type:"object",properties:{topics:{type:"array",items:{type:"string"}},rating:{type:"integer"},consent:{type:"boolean"},email:{type:"string",format:"email"}},additionalProperties:false})};
  const parse = (entries: string[][]) => parseBrowserSubmission("application/x-www-form-urlencoded",new URLSearchParams(entries).toString(),protections);
  test("decodes JSON arrays without losing their structure", () => {
    expect(parse([["topics",'["forms","surveys"]']]).payload).toEqual({topics:["forms","surveys"]});
    expect(parse([["topics","forms"],["topics","surveys"]]).payload).toEqual({topics:["forms","surveys"]});
  });
  test("omits blank controls but preserves raw entries for size limits", () => {
    const result=parse([["rating",""],["consent",""],["email",""]]);
    expect(result.payload).toEqual({});
    expect(result.limitPayload).toEqual({rating:[""],consent:[""],email:[""]});
  });
  test.each(['[broken','[]','[["nested"]]','[{"a":1}]'])('rejects invalid array input %s', value => {
    expect(()=>parse([["topics",value]])).toThrow(InvalidBrowserSubmissionError);
  });
});


test("HTML field names cannot collide with inherited object properties", () => {
  const result=parseBrowserSubmission("application/x-www-form-urlencoded",new URLSearchParams({constructor:"Ada",toString:"value"}).toString(),{altchaEnabled:false,honeypotEnabled:false});
  expect(result.payload).toEqual({constructor:"Ada",toString:"value"});
  expect(result.limitPayload).toEqual({constructor:["Ada"],toString:["value"]});
});
