import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminExamplesHandler } from "@/server/admin/examples-handler";

export async function POST(request: Request) {
  return createAdminExamplesHandler({
    database: getRuntimeDatabase().db,
  }).create(request);
}
