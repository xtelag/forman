import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSubmissionsHandler } from "@/server/submissions/admin-submissions-handler";

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return createAdminSubmissionsHandler({ database: getRuntimeDatabase().db }).get(request, submissionId);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return createAdminSubmissionsHandler({ database: getRuntimeDatabase().db }).delete(request, submissionId);
}
