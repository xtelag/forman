import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string; pipelineId: string }> },
) {
  const { actionId, pipelineId } = await params;
  return createAdminPipelinesHandler({ database: getRuntimeDatabase().db }).moveAction(pipelineId, actionId, request);
}
