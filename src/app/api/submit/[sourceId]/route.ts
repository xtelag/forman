import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { handleIntakeRequest } from "@/server/submissions/intake-handler";
import { applyBrowserCorsHeaders } from "@/server/sources/cors";
import { findActiveSourceBySourceId, normalizeSourceId } from "@/server/sources/source-service";
import { getPublicPopupConfiguration } from "@/server/sources/public-popup-configuration-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId: requestedSourceId } = await params;
  const sourceId = normalizeSourceId(requestedSourceId);

  const database = getRuntimeDatabase().db;
  const source = await findActiveSourceBySourceId(database, sourceId);
  const origin = request.headers.get("origin");
  const response = await getPublicPopupConfiguration(
    { database },
    sourceId,
    origin,
  );
  return source
    ? applyBrowserCorsHeaders(response, source.allowedOrigins, origin)
    : response;
}

export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId: requestedSourceId } = await params;
  const database = getRuntimeDatabase().db;
  const environment = loadEnvironment(process.env);
  return handleIntakeRequest(
    { database, environment },
    requestedSourceId,
    request,
  );
}

export async function OPTIONS(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId: requestedSourceId } = await params;
  const environment = loadEnvironment(process.env);
  return handleIntakeRequest(
    { database: getRuntimeDatabase().db, environment },
    requestedSourceId,
    request,
  );
}
