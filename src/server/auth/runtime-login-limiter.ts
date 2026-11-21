import { LoginAttemptLimiter } from "./login-limiter";

const globalForLoginLimiter = globalThis as typeof globalThis & {
  formanLoginAttemptLimiters?: Map<string, LoginAttemptLimiter>;
};

type RuntimeLoginLimiterOptions = {
  capacity: number;
  maxAttempts: number;
  windowMs: number;
};

export function getRuntimeLoginAttemptLimiter({ capacity, maxAttempts, windowMs }: RuntimeLoginLimiterOptions) {
  globalForLoginLimiter.formanLoginAttemptLimiters ??= new Map();
  const key = `${capacity}:${maxAttempts}:${windowMs}`;
  const existing = globalForLoginLimiter.formanLoginAttemptLimiters.get(key);
  if (existing) return existing;

  const limiter = new LoginAttemptLimiter({ capacity, maxAttempts, windowMs });
  globalForLoginLimiter.formanLoginAttemptLimiters.set(key, limiter);
  return limiter;
}
