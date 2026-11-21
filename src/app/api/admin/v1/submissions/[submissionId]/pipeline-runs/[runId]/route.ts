import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPipelineRunsHandler } from "@/server/pipelines/admin-pipeline-runs-handler";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string; submissionId: string }> }) {
  const { runId, submissionId } = await params;
  return createAdminPipelineRunsHandler({ database: getRuntimeDatabase().db }).getForSubmission(submissionId, runId, request);
}
