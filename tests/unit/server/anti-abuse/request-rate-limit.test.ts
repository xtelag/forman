import { describe, expect, test } from "vitest";

import { TtlRateLimiter } from "@/server/anti-abuse/rate-limiter";
import { consumeTrustedRequestRateLimit, consumeTrustedRequestRateLimits } from "@/server/anti-abuse/request-rate-limit";

describe("consumeTrustedRequestRateLimit", () => {
  test("uses one trusted client IP and rejects a bucket after its configured limit", () => {
    const limiter = new TtlRateLimiter({ capacity: 10 });
    const request = new Request("https://forman.example.test", { headers: { "x-forwarded-for": "203.0.113.5" } });

    expect(consumeTrustedRequestRateLimit({ bucket: { kind: "client", name: "browser" }, limiter, request, limit: 1, ttlMs: 60_000, trustProxy: true })).toBeNull();
    const response = consumeTrustedRequestRateLimit({ bucket: { kind: "client", name: "browser" }, limiter, request, limit: 1, ttlMs: 60_000, trustProxy: true });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("60");
  });

  test("shares a Source bucket across different clients", () => {
    const limiter = new TtlRateLimiter({ capacity: 100 });
    const policies = [{ bucket: { kind: "source" as const, name: "submission", sourceId: "one" }, limit: 2, ttlMs: 60_000 }];
    const requestFrom = (ip: string) => new Request("https://forman.example.test", { headers: { "x-forwarded-for": ip } });

    expect(consumeTrustedRequestRateLimits({ limiter, policies, request: requestFrom("203.0.113.5"), trustProxy: true })).toBeNull();
    expect(consumeTrustedRequestRateLimits({ limiter, policies, request: requestFrom("203.0.113.6"), trustProxy: true })).toBeNull();
    expect(consumeTrustedRequestRateLimits({ limiter, policies, request: requestFrom("203.0.113.7"), trustProxy: true })?.status).toBe(429);
  });

  test("derives client, client-Source, Source, and global buckets independently", () => {
    const limiter = new TtlRateLimiter({ capacity: 100 });
    const requestFrom = (ip: string) => new Request("https://forman.example.test", { headers: { "x-forwarded-for": ip } });
    const consume = (bucket: Parameters<typeof consumeTrustedRequestRateLimit>[0]["bucket"], ip: string) =>
      consumeTrustedRequestRateLimit({ bucket, limit: 1, limiter, request: requestFrom(ip), trustProxy: true, ttlMs: 60_000 });

    expect(consume({ kind: "client-source", name: "submission", sourceId: "one" }, "203.0.113.5")).toBeNull();
    expect(consume({ kind: "client-source", name: "submission", sourceId: "one" }, "203.0.113.6")).toBeNull();
    expect(consume({ kind: "client-source", name: "submission", sourceId: "one" }, "203.0.113.5")?.status).toBe(429);
    expect(consume({ kind: "client", name: "submission" }, "203.0.113.5")).toBeNull();
    expect(consume({ kind: "client", name: "submission" }, "203.0.113.5")?.status).toBe(429);
    expect(consume({ kind: "source", name: "challenge", sourceId: "one" }, "203.0.113.5")).toBeNull();
    expect(consume({ kind: "source", name: "challenge", sourceId: "one" }, "203.0.113.6")?.status).toBe(429);
    expect(consume({ kind: "global", name: "login" }, "203.0.113.5")).toBeNull();
    expect(consume({ kind: "global", name: "login" }, "203.0.113.6")?.status).toBe(429);
  });

  test("skips client-scoped policies when a trusted address is unavailable while retaining source protection", () => {
    const limiter = new TtlRateLimiter({ capacity: 10 });
    const request = new Request("https://forman.example.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    const policies = [
      { bucket: { kind: "client" as const, name: "browser" }, limit: 1, ttlMs: 60_000 },
      { bucket: { kind: "source" as const, name: "browser", sourceId: "contact" }, limit: 1, ttlMs: 60_000 },
    ];

    expect(consumeTrustedRequestRateLimits({ limiter, policies, request, trustProxy: true })).toBeNull();
    expect(consumeTrustedRequestRateLimits({ limiter, policies, request, trustProxy: true })?.status).toBe(429);
  });
});
