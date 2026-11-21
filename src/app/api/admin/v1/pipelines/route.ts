import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";

export async function GET(request: Request) {
  return createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  }).list(request);
}

export async function POST(request: Request) {
  const handler = createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  });
  const body = await request.clone().json().catch(() => undefined);
  return body && typeof body === "object" && "steps" in body
    ? handler.create(request)
    : handler.createConfiguration(request);
}
