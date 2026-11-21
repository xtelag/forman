import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelinesHandler } from "@/server/pipelines/admin-pipelines-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pipelineId: string }> },
) {
  const { pipelineId } = await params;
  return createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  }).get(pipelineId, request);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ pipelineId: string }> },
) {
  const { pipelineId } = await params;
  return createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  }).update(pipelineId, request);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ pipelineId: string }> },
) {
  const { pipelineId } = await params;
  return createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  }).updateConfiguration(pipelineId, request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ pipelineId: string }> },
) {
  const { pipelineId } = await params;
  return createAdminPipelinesHandler({
    database: getRuntimeDatabase().db,
  }).delete(pipelineId, request);
}
