import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { handleServerSubmission } from "@/server/submissions/server-submission-handler";

import { findSourceBySourceId } from "./source-service";
import { getServerSubmissionToken } from "./server-token-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export function createAdminTestSubmissionHandler({ database }: { database: FormanDatabase }) {
  return {
    async submit(request: Request, publicSourceId: string) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source) return Response.json({ error: "Not found" }, { status: 404 });
      const serverToken = await getServerSubmissionToken(database, source.id);
      if (!serverToken) return Response.json({ error: "Machine-to-machine token not found" }, { status: 404 });

      return handleServerSubmission(database, publicSourceId, new Request(request.url, {
        body: await request.text(),
        headers: {
          authorization: `Bearer ${serverToken.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }));
    },
  };
}
