import type { createDatabase } from "@/server/db/client";
import type { loadEnvironment } from "@/server/config/environment";
import { findSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";
import { handleSessionRequest } from "@/server/source-sessions/public-handler";
import { handleBrowserSubmissionPreflight, handleBrowserSubmissionRequest } from "./browser-submission-request-handler";
import { handleM2mSubmissionRequest } from "./m2m-request-handler";

type Dependencies = { database: ReturnType<typeof createDatabase>["db"]; environment: ReturnType<typeof loadEnvironment> };
export async function handleIntakeRequest(dependencies: Dependencies, requestedSourceId: string, request: Request) {
  const sourceId = normalizeSourceId(requestedSourceId);
  const source = await findSourceBySourceId(dependencies.database, sourceId);
  if (!source) return request.method === "OPTIONS"
    ? handleBrowserSubmissionPreflight(dependencies, sourceId, request)
    : handleBrowserSubmissionRequest(dependencies, sourceId, request);
  if (source.type === "session") return handleSessionRequest(dependencies, sourceId, request);
  if (request.method === "OPTIONS") {
    if (source.type === "m2m") return new Response(null, { status: 405, headers: { allow: "POST" } });
    return handleBrowserSubmissionPreflight(dependencies, sourceId, request);
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST, OPTIONS" } });
  return source.type === "m2m"
    ? handleM2mSubmissionRequest(dependencies, sourceId, request)
    : handleBrowserSubmissionRequest(dependencies, sourceId, request);
}
