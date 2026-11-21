import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminTestSubmissionHandler } from "@/server/sources/admin-test-submission-handler";

export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return createAdminTestSubmissionHandler({ database: getRuntimeDatabase().db }).submit(request, sourceId);
}
