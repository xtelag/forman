import { loadEnvironment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { getTrustedClientIp } from "@/server/anti-abuse/client-ip";
import { consumeTrustedRequestRateLimits } from "@/server/anti-abuse/request-rate-limit";
import { getRuntimeRateLimiter } from "@/server/anti-abuse/runtime-rate-limiter";
import { getChallengeResponse } from "@/server/sources/challenge-handler";
import {
  applyBrowserCorsHeaders,
  browserFirstPartyOrigins,
  isBrowserRequestOriginAllowed,
} from "@/server/sources/cors";
import { findActiveSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";

export async function GET(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId: requestedSourceId } = await params;
  const sourceId = normalizeSourceId(requestedSourceId);

  const database = getRuntimeDatabase().db;
  const environment = loadEnvironment(process.env);
  const settings = await getGlobalSettings(database);
  const source = await findActiveSourceBySourceId(database, sourceId);
  if (source && !source.altchaEnabled) return new Response(null, { status: 404 });
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
    return new Response("Origin is not authorized", { status: 403, headers: { vary: "Origin" } });
  }
  const limit = source?.challengeRateLimitPerMinute ?? settings.challengeRateLimitPerMinute;
  const limited = consumeTrustedRequestRateLimits({
    policies: getTrustedClientIp(request.headers, environment.trustProxy)
      ? [{ bucket: { kind: "client-source", name: "challenge", sourceId }, limit, ttlMs: 60_000 }]
      : [{ bucket: { kind: "source", name: "challenge", sourceId }, limit, ttlMs: 60_000 }],
    limiter: getRuntimeRateLimiter(
      settings.rateLimiterCapacity,
      settings.rateLimiterTtlSeconds * 1_000,
    ),
    request,
    trustProxy: environment.trustProxy,
  });
  if (limited) {
    return source
      ? applyBrowserCorsHeaders(
          limited,
          source.allowedOrigins,
          origin,
          firstPartyOrigins,
        )
      : limited;
  }
  const response = await getChallengeResponse(
    { database, environment },
    sourceId,
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
