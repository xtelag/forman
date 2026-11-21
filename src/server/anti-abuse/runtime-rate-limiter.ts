import { TtlRateLimiter } from "./rate-limiter";

const globalForRateLimiters = globalThis as typeof globalThis & {
  formanRateLimiters?: Map<string, TtlRateLimiter>;
};

export function getRuntimeRateLimiter(capacity: number, retentionTtlMs: number) {
  globalForRateLimiters.formanRateLimiters ??= new Map();
  const key = `${capacity}:${retentionTtlMs}`;
  const limiter = globalForRateLimiters.formanRateLimiters.get(key);
  if (limiter) return limiter;

  const created = new TtlRateLimiter({ capacity, retentionTtlMs });
  globalForRateLimiters.formanRateLimiters.set(key, created);
  return created;
}
