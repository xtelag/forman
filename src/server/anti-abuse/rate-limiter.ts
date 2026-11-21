type TtlRateLimiterOptions = {
  capacity: number;
  now?: () => number;
  retentionTtlMs?: number;
};

type Bucket = {
  count: number;
  expiresAt: number;
  windowExpiresAt: number;
};

export class TtlRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly retentionTtlMs: number;

  constructor({ capacity, now = Date.now, retentionTtlMs = 60_000 }: TtlRateLimiterOptions) {
    this.capacity = capacity;
    this.now = now;
    this.retentionTtlMs = retentionTtlMs;
  }

  get size() {
    this.pruneExpired();
    return this.buckets.size;
  }

  tryConsume(key: string, limit: number, ttlMs: number) {
    const bucket = this.getBucket(key);

    if (bucket && bucket.windowExpiresAt > this.now()) {
      if (bucket.count >= limit) {
        return false;
      }

      bucket.count += 1;
      bucket.expiresAt = this.now() + this.retentionTtlMs;
      return true;
    }

    if (!bucket) this.ensureCapacity();
    const now = this.now();
    this.buckets.set(key, {
      count: 1,
      expiresAt: now + this.retentionTtlMs,
      windowExpiresAt: now + ttlMs,
    });
    return true;
  }

  private ensureCapacity() {
    this.pruneExpired();
    if (this.buckets.size < this.capacity) {
      return;
    }

    const oldestKey = this.buckets.keys().next().value;
    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  private getBucket(key: string) {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.expiresAt <= this.now()) {
      this.buckets.delete(key);
      return undefined;
    }

    return bucket;
  }

  private pruneExpired() {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
