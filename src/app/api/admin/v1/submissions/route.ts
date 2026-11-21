import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminSubmissionsHandler } from "@/server/submissions/admin-submissions-handler";

export async function GET(request: Request) {
  return createAdminSubmissionsHandler({ database: getRuntimeDatabase().db }).list(request);
}

export async function DELETE(request: Request) {
  return createAdminSubmissionsHandler({ database: getRuntimeDatabase().db }).remove(request);
}
