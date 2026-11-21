import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminTagsHandler } from "@/server/tags/admin-tags-handler";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  return createAdminTagsHandler({ database: getRuntimeDatabase().db }).delete(
    request,
    (await params).tagId,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  return createAdminTagsHandler({ database: getRuntimeDatabase().db }).usage(
    request,
    (await params).tagId,
  );
}
