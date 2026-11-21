import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).getById((await params).runId, request);
}
