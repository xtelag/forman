import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";

type RouteParameters = { params: Promise<{ actionId: string; pipelineId: string }> };

export async function PATCH(request: Request, { params }: RouteParameters) {
  const { actionId, pipelineId } = await params;
  return createAdminPipelinesHandler({ database: getRuntimeDatabase().db }).updateAction(pipelineId, actionId, request);
}

export async function DELETE(request: Request, { params }: RouteParameters) {
  const { actionId, pipelineId } = await params;
  return createAdminPipelinesHandler({ database: getRuntimeDatabase().db }).deleteAction(pipelineId, actionId, request);
}
