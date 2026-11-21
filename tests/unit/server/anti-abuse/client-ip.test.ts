import { describe, expect, test } from "vitest";

import { getTrustedClientIp } from "@/server/anti-abuse/client-ip";

describe("getTrustedClientIp", () => {
  test("uses one proxy-normalized forwarded address", () => {
    expect(
      getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.4" }), true),
    ).toBe("203.0.113.4");
  });

  test("fails closed for untrusted proxy mode or a client-controlled chain", () => {
    expect(
      getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.4" }), false),
    ).toBeNull();
    expect(
      getTrustedClientIp(
        new Headers({ "x-forwarded-for": "203.0.113.4, 198.51.100.9" }),
        true,
      ),
    ).toBeNull();
  });
});
