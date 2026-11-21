import { z } from "zod";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";

import { createTag, deleteTag, getTagUsage, listTags, type TagColor } from "./tag-service";

type Database = ReturnType<typeof createDatabase>["db"];
const tagSchema = z.object({
  color: z.enum(["rose", "coral", "peach", "amber", "lemon", "mint", "emerald", "teal", "sky", "blue", "indigo", "violet", "fuchsia"]),
  name: z.string().trim().min(1).max(64),
});

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function createAdminTagsHandler({ database }: { database: Database }) {
  async function authenticate(request: Request) {
    return getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
  }

  return {
    async list(request: Request) {
      if (!(await authenticate(request))) return unauthorized();
      return Response.json({ items: await listTags(database) });
    },
    async create(request: Request) {
      if (!(await authenticate(request))) return unauthorized();
      const parsed = tagSchema.safeParse(await request.json().catch(() => undefined));
      if (!parsed.success)
        return Response.json({ error: "Enter a tag name and color" }, { status: 400 });
      try {
        return Response.json(
          await createTag(database, parsed.data as { color: TagColor; name: string }),
          { status: 201 },
        );
      } catch {
        return Response.json({ error: "A tag with this name already exists" }, { status: 409 });
      }
    },
    async delete(request: Request, tagId: string) {
      if (!(await authenticate(request))) return unauthorized();
      const result = await deleteTag(database, tagId);
      if (!result.deleted)
        return Response.json({ error: "Tag not found" }, { status: 404 });
      return Response.json(result);
    },
    async usage(request: Request, tagId: string) {
      if (!(await authenticate(request))) return unauthorized();
      const usage = await getTagUsage(database, tagId);
      if (!usage) return Response.json({ error: "Tag not found" }, { status: 404 });
      return Response.json(usage);
    },
  };
}
