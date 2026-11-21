import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import type { AdminApplicationResponse } from "@/shared/contracts/admin";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function createAdminApplicationHandler({ baseUrl, database, isProduction = process.env.NODE_ENV === "production" }: { baseUrl: URL; database: FormanDatabase; isProduction?: boolean }) {
  return {
    async get(request: Request) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) return unauthorized();
      const response: AdminApplicationResponse = { baseUrl: baseUrl.toString().replace(/\/$/, ""), isProduction };
      return Response.json(response);
    },
  };
}
