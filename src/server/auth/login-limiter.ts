type LoginAttemptLimiterOptions = {
  capacity?: number;
  maxAttempts?: number;
  now?: () => number;
  windowMs?: number;
};

type FailureBucket = {
  attempts: number;
  expiresAt: number;
};

export class LoginAttemptLimiter {
  private readonly buckets = new Map<string, FailureBucket>();
  private readonly capacity: number;
  private readonly maxAttempts: number;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor({
    capacity = 10_000,
    maxAttempts = 5,
    now = Date.now,
    windowMs = 15 * 60 * 1000,
  }: LoginAttemptLimiterOptions = {}) {
    this.capacity = capacity;
    this.maxAttempts = maxAttempts;
    this.now = now;
    this.windowMs = windowMs;
  }

  clear(clientAddress: string) {
    this.buckets.delete(clientAddress);
  }

  isLimited(clientAddress: string) {
    const bucket = this.getBucket(clientAddress);
    return (bucket?.attempts ?? 0) >= this.maxAttempts;
  }

  recordFailure(clientAddress: string) {
    const now = this.now();
    const bucket = this.getBucket(clientAddress);

    if (bucket) {
      bucket.attempts += 1;
      return;
    }

    this.ensureCapacity();
    this.buckets.set(clientAddress, { attempts: 1, expiresAt: now + this.windowMs });
  }

  private ensureCapacity() {
    if (this.buckets.size < this.capacity) {
      return;
    }

    const oldestKey = this.buckets.keys().next().value;
    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  private getBucket(clientAddress: string) {
    const bucket = this.buckets.get(clientAddress);

    if (bucket && bucket.expiresAt <= this.now()) {
      this.buckets.delete(clientAddress);
      return undefined;
    }

    return bucket;
  }
}
