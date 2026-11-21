import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pipelineId: string }> },
) {
  const { pipelineId } = await params;
  return createAdminPipelinesHandler({ database: getRuntimeDatabase().db }).createAction(pipelineId, request);
}
