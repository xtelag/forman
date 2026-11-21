import { describe, expect, test } from "vitest";

import { TtlRateLimiter } from "@/server/anti-abuse/rate-limiter";

describe("TtlRateLimiter", () => {
  test("enforces a per-key window then releases it after expiry", () => {
    let now = 0;
    const limiter = new TtlRateLimiter({ capacity: 2, now: () => now });

    expect(limiter.tryConsume("form:one", 2, 1_000)).toBe(true);
    expect(limiter.tryConsume("form:one", 2, 1_000)).toBe(true);
    expect(limiter.tryConsume("form:one", 2, 1_000)).toBe(false);

    now = 1_000;
    expect(limiter.tryConsume("form:one", 2, 1_000)).toBe(true);
  });

  test("bounds the number of keys retained in memory", () => {
    const limiter = new TtlRateLimiter({ capacity: 2 });

    limiter.tryConsume("one", 1, 60_000);
    limiter.tryConsume("two", 1, 60_000);
    limiter.tryConsume("three", 1, 60_000);

    expect(limiter.size).toBe(2);
  });

  test("keeps an inactive bucket for the configured retention TTL without extending its rate-limit window", () => {
    let now = 0;
    const limiter = new TtlRateLimiter({
      capacity: 2,
      now: () => now,
      retentionTtlMs: 10_000,
    });

    expect(limiter.tryConsume("form:one", 1, 1_000)).toBe(true);
    now = 1_000;
    expect(limiter.size).toBe(1);
    expect(limiter.tryConsume("form:one", 1, 1_000)).toBe(true);

    now = 11_001;
    expect(limiter.size).toBe(0);
  });
});
