import type { loadEnvironment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import type { createDatabase } from "@/server/db/client";
import { consumeTrustedRequestRateLimits } from "@/server/anti-abuse/request-rate-limit";
import { getRuntimeRateLimiter } from "@/server/anti-abuse/runtime-rate-limiter";
import { handleBrowserSubmission } from "@/server/submissions/browser-handler";
import { browserErrorResponse } from "@/server/submissions/browser-error-response";
import {
  applyBrowserCorsHeaders,
  browserFirstPartyOrigins,
  browserPreflightHeaders,
  browserPreflightStatus,
  isBrowserRequestOriginAllowed,
} from "@/server/sources/cors";
import { findActiveSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type BrowserSubmissionDependencies = {
  database: FormanDatabase;
  environment: ReturnType<typeof loadEnvironment>;
};

export async function handleBrowserSubmissionRequest(
  { database, environment }: BrowserSubmissionDependencies,
  requestedSourceId: string,
  request: Request,
) {
  const sourceId = normalizeSourceId(requestedSourceId);
  const settings = await getGlobalSettings(database);
  const source = await findActiveSourceBySourceId(database, sourceId);
  const origin = request.headers.get("origin");
  const firstPartyOrigins = browserFirstPartyOrigins(environment);
  if (
    source &&
    !isBrowserRequestOriginAllowed(
      source.allowedOrigins,
      origin,
      firstPartyOrigins,
    )
  ) {
    return new Response("Origin is not authorized", {
      headers: { vary: "Origin" },
      status: 403,
    });
  }
  const limited = consumeTrustedRequestRateLimits({
    limiter: getRuntimeRateLimiter(
      settings.rateLimiterCapacity,
      settings.rateLimiterTtlSeconds * 1_000,
    ),
    policies: [
      {
        bucket: { kind: "client-source", name: "submission", sourceId },
        limit:
          source?.submissionRateLimitPerMinute ??
          settings.submissionRateLimitPerMinute,
        ttlMs: 60_000,
      },
      {
        bucket: { kind: "client", name: "submission" },
        limit: settings.clientRateLimitPerMinute,
        ttlMs: 60_000,
      },
      {
        bucket: { kind: "source", name: "submission", sourceId },
        limit: settings.sourceRateLimitPerMinute,
        ttlMs: 60_000,
      },
      {
        bucket: { kind: "client", name: "submission-burst" },
        limit: settings.clientBurstLimit,
        ttlMs: 10_000,
      },
    ],
    request,
    trustProxy: environment.trustProxy,
  });
  if (limited) {
    const response = browserErrorResponse(request, {
      baseUrl: environment.baseOrigin.toString(),
      sourceId,
      kind: "rate-limited",
      retryAfter: limited.headers.get("retry-after"),
    });
    return source
      ? applyBrowserCorsHeaders(
          response,
          source.allowedOrigins,
          origin,
          firstPartyOrigins,
        )
      : response;
  }
  const response = await handleBrowserSubmission(
    { database, environment },
    sourceId,
    request,
  );
  return source
    ? applyBrowserCorsHeaders(
        response,
        source.allowedOrigins,
        origin,
        firstPartyOrigins,
      )
    : response;
}

export async function handleBrowserSubmissionPreflight(
  { database, environment }: BrowserSubmissionDependencies,
  requestedSourceId: string,
  request: Request,
) {
  const sourceId = normalizeSourceId(requestedSourceId);
  const source = await findActiveSourceBySourceId(database, sourceId);
  if (!source || source.type !== "one-shot") return new Response(null, { status: 503 });
  const origin = request.headers.get("origin");
  const firstPartyOrigins = browserFirstPartyOrigins(environment);
  const status = browserPreflightStatus(
    source.allowedOrigins,
    origin,
    firstPartyOrigins,
  );
  return new Response(null, {
    headers:
      status === 204
        ? browserPreflightHeaders(
            source.allowedOrigins,
            origin,
            firstPartyOrigins,
          )
        : origin
          ? { vary: "Origin" }
          : undefined,
    status,
  });
}
