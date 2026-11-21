import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminTagsHandler } from "@/server/tags/admin-tags-handler";

function handler() {
  return createAdminTagsHandler({ database: getRuntimeDatabase().db });
}

export async function GET(request: Request) {
  return handler().list(request);
}

export async function POST(request: Request) {
  return handler().create(request);
}
