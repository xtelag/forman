import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function GET(request: Request) {
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).listAll(request);
}
