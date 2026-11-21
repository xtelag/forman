import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function GET(request: Request, { params }: { params: Promise<{ pipelineId: string; runId: string }> }) {
  const { pipelineId, runId } = await params;
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).get(pipelineId, runId, request);
}
