import { describe, expect, test } from "vitest";

import { createSuccessReturnTarget, readSuccessReturnTarget } from "@/server/submissions/success-return-target";

const options = {
  sourceId: "contact-form",
  now: new Date("2026-08-18T10:00:00.000Z"),
  sessionSecret: "a session secret that is at least thirty-two characters long",
};

describe("success return target", () => {
  test("returns the referring origin from an unmodified short-lived token", () => {
    const token = createSuccessReturnTarget("https://www.example.test/contact?campaign=summer", options);

    expect(readSuccessReturnTarget(token, options)).toBe("https://www.example.test");
  });

  test("rejects a modified or expired token", () => {
    const token = createSuccessReturnTarget("https://www.example.test/contact", options);

    expect(readSuccessReturnTarget(`${token}x`, options)).toBeNull();
    expect(readSuccessReturnTarget(token, { ...options, now: new Date("2026-08-18T10:11:00.000Z") })).toBeNull();
  });
});
