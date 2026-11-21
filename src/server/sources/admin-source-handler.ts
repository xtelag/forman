import { sourceTypeSchema } from "@/shared/source-type";
import { z } from "zod";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";

import { createSource, FriendlyNameConflictError, listSources } from "./source-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type AdminSourcesHandlerDependencies = {
  database: FormanDatabase;
};

const createSourceSchema = z.object({
  type: sourceTypeSchema,
  name: z.string().trim().min(1).max(120),
}).strict();

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function createAdminSourcesHandler({ database }: AdminSourcesHandlerDependencies) {
  return {
    async list(request: Request) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return unauthorized();

      return Response.json({ items: await listSources(database) });
    },
    async create(request: Request) {
      const session = await getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
      if (!session) return unauthorized();

      const parsed = createSourceSchema.safeParse(await request.json().catch(() => undefined));
      if (!parsed.success) return Response.json({ error: "Invalid Source" }, { status: 400 });

      try {
        const source = await createSource(database, parsed.data);
        return Response.json(source, { status: 201 });
      } catch (error) {
        if (error instanceof FriendlyNameConflictError) {
          return Response.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }
    },
  };
}
