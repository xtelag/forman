import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";

import { findSourceBySourceId } from "./source-service";
import { getServerSubmissionToken, issueServerSubmissionToken } from "./server-token-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export function createAdminServerTokenHandler({ database }: { database: FormanDatabase }) {
  return {
    async get(request: Request, publicSourceId: string) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source || source.type !== "m2m") return Response.json({ error: "Not found" }, { status: 404 });
      const token = await getServerSubmissionToken(database, source.id);
      if (!token) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(token);
    },
    async issue(request: Request, publicSourceId: string) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source || source.type !== "m2m") return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(await issueServerSubmissionToken(database, source.id), { status: 201 });
    },
  };
}
