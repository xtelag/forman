import { DuplicateJsonKeyError, parseUniqueJson } from "@/server/http/unique-json";
import { extractParams } from "altcha-lib/v1";
import type { Payload } from "altcha-lib/v1/types";
import type { createDatabase } from "@/server/db/client";
import type { Environment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import { consumeTrustedRequestRateLimits } from "@/server/anti-abuse/request-rate-limit";
import { getRuntimeRateLimiter } from "@/server/anti-abuse/runtime-rate-limiter";
import { getTrustedClientIp } from "@/server/anti-abuse/client-ip";
import { verifyAltchaChallenge } from "@/server/anti-abuse/altcha";
import { decodeAltchaPayload } from "@/server/submissions/altcha-payload";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/server/http/bounded-request-body";
import { findActiveSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";
import { browserCorsHeaders, browserFirstPartyOrigins, isBrowserRequestOriginAllowed } from "@/server/sources/cors";
import { findSourceSession, operateSession, sessionKeyHash, sessionSettings } from "./session-service";

type Dependencies = { database: ReturnType<typeof createDatabase>["db"]; environment: Environment };
export async function handleSessionRequest({ database, environment }: Dependencies, requestedSourceId: string, request: Request) {
  const sourceId = normalizeSourceId(requestedSourceId);
  const source = await findActiveSourceBySourceId(database, sourceId);
  const origin = request.headers.get("origin");
  const firstParty = browserFirstPartyOrigins(environment);
  const headers = new Headers({ "access-control-expose-headers": "retry-after", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
  const respond = (status: number, data: unknown) => Response.json(data, { status, headers });
  if (!source || !sessionSettings(database, source.id).enabled) return respond(404, { error: "Sessions are unavailable." });
  if (!isBrowserRequestOriginAllowed(source.allowedOrigins, origin, firstParty)) return respond(403, { error: "Origin is not authorized." });
  for (const [name, value] of Object.entries(browserCorsHeaders(source.allowedOrigins, origin, firstParty))) headers.set(name, value);
  if (request.method === "OPTIONS") {
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return respond(405, { error: "Use POST." });
  let body: unknown;
  let inputError: { status: number; error: string } | undefined;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    inputError = { status: 415, error: "Use application/json." };
  } else {
    try { body = parseUniqueJson(await readBoundedRequestText(request, source.maxBodyBytes)); }
    catch (error) {
      const protectionDuplicate = error instanceof DuplicateJsonKeyError && ["honeypot", "altcha", ...source.honeypotFieldNames].includes(error.key);
      inputError = { status: protectionDuplicate ? 403 : error instanceof RequestBodyTooLargeError ? 413 : 400, error: protectionDuplicate ? "Verification failed" : "Invalid or oversized request." };
    }
  }
  const envelope = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : undefined;
  const sessionId = envelope?.sessionId;
  const keyHash = typeof sessionId === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(sessionId) ? sessionKeyHash(sessionId) : null;
  if (envelope) {
    const { sessionId: _sessionId, ...operation } = envelope;
    void _sessionId;
    body = operation;
  }
  const known = keyHash ? findSourceSession(database, source.id, keyHash) : undefined;
  const settings = await getGlobalSettings(database);
  const limited = consumeTrustedRequestRateLimits({ limiter: getRuntimeRateLimiter(settings.rateLimiterCapacity, settings.rateLimiterTtlSeconds * 1000), request, trustProxy: environment.trustProxy, policies: known ? [
    // A valid capability represents ongoing form interaction, not a new submission.
    { bucket: { kind: "global", name: `source-session-interaction:${known.id}:burst` }, limit: 20, ttlMs: 10000 },
    { bucket: { kind: "global", name: `source-session-interaction:${known.id}:minute` }, limit: 60, ttlMs: 60000 },
    { bucket: { kind: "client", name: "source-session-interaction" }, limit: 120, ttlMs: 60000 },
    { bucket: { kind: "source", name: "source-session-interaction", sourceId }, limit: 600, ttlMs: 60000 },
  ] : [
    { bucket: { kind: "client-source", name: "source-session", sourceId }, limit: source.submissionRateLimitPerMinute ?? settings.submissionRateLimitPerMinute, ttlMs: 60000 },
    { bucket: { kind: "client", name: "source-session" }, limit: settings.clientRateLimitPerMinute, ttlMs: 60000 },
    { bucket: { kind: "source", name: "source-session", sourceId }, limit: settings.sourceRateLimitPerMinute, ttlMs: 60000 },
    { bucket: { kind: "client", name: "source-session-burst" }, limit: settings.clientBurstLimit, ttlMs: 10000 },
  ] });
  if (limited) { headers.set("retry-after", limited.headers.get("retry-after") ?? "60"); return respond(429, { error: "Too many requests." }); }
  if (inputError) return respond(inputError.status, { error: inputError.error });
  if (!keyHash) return respond(401, { error: "A valid secret sessionId is required." });
  let creationProof: { challengeId: string; expiresAt: Date } | undefined;
  if (!known && body && typeof body === "object" && "operation" in body && body.operation === "open") {
    const raw = "protection" in body ? body.protection : undefined;
    const protection = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
    if (source.honeypotEnabled) {
      const honey = protection?.honeypot;
      if (!honey || typeof honey !== "object" || Array.isArray(honey) ||
          Object.keys(honey).length !== source.honeypotFieldNames.length ||
          source.honeypotFieldNames.some(name => !Object.hasOwn(honey, name) || (honey as Record<string, unknown>)[name] !== "")) {
        return respond(403, { error: "Verification failed" });
      }
    }
    if (source.altchaEnabled) {
      try {
        if (typeof protection?.altcha !== "string" || !protection.altcha) throw new Error();
        const payload = decodeAltchaPayload(protection.altcha) as Payload;
        if (!await verifyAltchaChallenge({ sourceId, payload, secret: environment.altchaSecret })) throw new Error();
        const params = extractParams(payload);
        creationProof = { challengeId: payload.signature, expiresAt: new Date(Number(params.expires ?? params.expire ?? 0) * 1000) };
      } catch { return respond(403, { error: "Verification failed" }); }
    }
  }
  const result = await operateSession({ database, source, keyHash, body, creationProof, metadata: {
    clientIp: getTrustedClientIp(request.headers, environment.trustProxy), userAgent: request.headers.get("user-agent"),
    // Invitations may carry capabilities in query parameters; never retain them.
    referer: origin,
  } });
  return respond(result.status, result.data ?? { error: result.error });
}
