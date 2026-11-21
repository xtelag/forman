import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminCallbacksHandler } from "@/server/pipelines/admin-callbacks-handler";

export async function GET(request: Request) {
  return createAdminCallbacksHandler({ database: getRuntimeDatabase().db }).list(request);
}
