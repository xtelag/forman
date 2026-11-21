import { describe, expect, test } from "vitest";

import { LoginAttemptLimiter } from "@/server/auth/login-limiter";

describe("LoginAttemptLimiter", () => {
  test("blocks the sixth failed login from one client for fifteen minutes", () => {
    let now = 1_000_000;
    const limiter = new LoginAttemptLimiter({ now: () => now });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.isLimited("203.0.113.4")).toBe(false);
      limiter.recordFailure("203.0.113.4");
    }

    expect(limiter.isLimited("203.0.113.4")).toBe(true);
    expect(limiter.isLimited("203.0.113.5")).toBe(false);

    now += 15 * 60 * 1000;
    expect(limiter.isLimited("203.0.113.4")).toBe(false);
  });

  test("clears failed attempts after a successful login", () => {
    const limiter = new LoginAttemptLimiter();
    limiter.recordFailure("203.0.113.4");
    limiter.clear("203.0.113.4");

    expect(limiter.isLimited("203.0.113.4")).toBe(false);
  });
});
