import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function GET(request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).list((await params).pipelineId, request);
}
