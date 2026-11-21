import { describe, expect, test } from "vitest";

import { decodeAltchaPayload } from "@/server/submissions/altcha-payload";

describe("decodeAltchaPayload", () => {
  test("decodes the Base64URL JSON payload submitted by the ALTCHA widget", () => {
    const payload = { challenge: { parameters: { nonce: "nonce" } }, solution: { number: 42 } };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

    expect(decodeAltchaPayload(encoded)).toEqual(payload);
  });

  test("rejects malformed payloads", () => {
    expect(() => decodeAltchaPayload("not-json")).toThrow();
  });
});
