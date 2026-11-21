import type { createDatabase } from "@/server/db/client";
import { handleServerSubmission } from "@/server/submissions/server-submission-handler";
import { loadEnvironment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import { consumeTrustedRequestRateLimits } from "@/server/anti-abuse/request-rate-limit";
import { getRuntimeRateLimiter } from "@/server/anti-abuse/runtime-rate-limiter";
import { findActiveSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";

export async function handleM2mSubmissionRequest({ database, environment }: { database: ReturnType<typeof createDatabase>["db"]; environment: ReturnType<typeof loadEnvironment> }, requestedSourceId: string, request: Request) {
  const sourceId = normalizeSourceId(requestedSourceId);
  const settings = await getGlobalSettings(database);
  const source = await findActiveSourceBySourceId(database, sourceId);
  const limiter = getRuntimeRateLimiter(
    settings.rateLimiterCapacity,
    settings.rateLimiterTtlSeconds * 1_000,
  );
  const limited = consumeTrustedRequestRateLimits({
    limiter,
    policies: [
      { bucket: { kind: "client-source", name: "submission", sourceId }, limit: source?.submissionRateLimitPerMinute ?? settings.submissionRateLimitPerMinute, ttlMs: 60_000 },
      { bucket: { kind: "client", name: "submission" }, limit: settings.clientRateLimitPerMinute, ttlMs: 60_000 },
      { bucket: { kind: "client", name: "submission-burst" }, limit: settings.clientBurstLimit, ttlMs: 10_000 },
    ],
    request,
    trustProxy: environment.trustProxy,
  });
  if (limited) return limited;
  return handleServerSubmission(database, sourceId, request, {
    afterAuthentication: () => consumeTrustedRequestRateLimits({
      limiter,
      policies: [{
        bucket: { kind: "source", name: "submission", sourceId },
        limit: settings.sourceRateLimitPerMinute,
        ttlMs: 60_000,
      }],
      request,
      trustProxy: environment.trustProxy,
    }),
  });
}
