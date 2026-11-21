import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function POST(request: Request, { params }: { params: Promise<{ actionRunId: string }> }) {
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).retry((await params).actionRunId, request);
}
