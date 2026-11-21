import { getTrustedClientIp } from "./client-ip";
import { TtlRateLimiter } from "./rate-limiter";

type RequestRateLimitInput = {
  bucket: RateLimitBucket;
  limit: number;
  limiter: TtlRateLimiter;
  request: Request;
  trustProxy: boolean;
  ttlMs: number;
};

export type RateLimitBucket =
  | { kind: "client"; name: string }
  | { kind: "client-source"; name: string; sourceId: string }
  | { kind: "source"; name: string; sourceId: string }
  | { kind: "global"; name: string };

type RateLimitPolicy = {
  bucket: RateLimitBucket;
  limit: number;
  ttlMs: number;
};

type RequestRateLimitsInput = Omit<RequestRateLimitInput, "bucket" | "limit" | "ttlMs"> & {
  policies: RateLimitPolicy[];
};

export function consumeTrustedRequestRateLimit({
  bucket,
  limit,
  limiter,
  request,
  trustProxy,
  ttlMs,
}: RequestRateLimitInput) {
  return consumeTrustedRequestRateLimits({
    limiter,
    policies: [{ bucket, limit, ttlMs }],
    request,
    trustProxy,
  });
}

function bucketKey(bucket: RateLimitBucket, clientIp: string | null) {
  switch (bucket.kind) {
    case "client":
      return `${bucket.name}:client:${clientIp}`;
    case "client-source":
      return `${bucket.name}:client-source:${bucket.sourceId}:${clientIp}`;
    case "source":
      return `${bucket.name}:source:${bucket.sourceId}`;
    case "global":
      return `${bucket.name}:global`;
  }
}

export function consumeTrustedRequestRateLimits({
  limiter,
  policies,
  request,
  trustProxy,
}: RequestRateLimitsInput) {
  const clientIp = getTrustedClientIp(request.headers, trustProxy);
  const applicablePolicies = clientIp
    ? policies
    : policies.filter(({ bucket }) =>
      bucket.kind !== "client" && bucket.kind !== "client-source");

  for (const policy of applicablePolicies) {
    if (!limiter.tryConsume(bucketKey(policy.bucket, clientIp), policy.limit, policy.ttlMs)) {
      return Response.json(
        { error: "Too many requests" },
        { headers: { "retry-after": String(Math.ceil(policy.ttlMs / 1_000)) }, status: 429 },
      );
    }
  }

  return null;
}
