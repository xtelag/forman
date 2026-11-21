import { describe, expect, test } from "vitest";

import { createSubmissionEnvelope } from "@/server/flows/submission-envelope";

describe("createSubmissionEnvelope", () => {
  test("retains submitted payload and available client metadata", () => {
    expect(createSubmissionEnvelope({ client: { ip: "203.0.113.10", userAgent: "curl/8" }, date: new Date("2026-08-14T20:15:42.123Z"), form: { sourceId: "contact", name: "Contact" }, payload: { email: "john@example.test" }, source: "m2m", submissionId: "submission-1" })).toEqual({ date: "2026-08-14T20:15:42.123Z", meta: { client: { ip: "203.0.113.10", userAgent: "curl/8" }, sourceId: "contact", sourceName: "Contact", source: "m2m", submissionId: "submission-1" }, payload: { email: "john@example.test" } });
  });
});
