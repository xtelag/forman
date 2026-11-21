import type { createDatabase } from "@/server/db/client";

import { getAdministratorSessionToken } from "./request-auth";
import { deleteSession, serializeAdministratorSessionCookie } from "./sessions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type LogoutHandlerDependencies = {
  database: FormanDatabase;
  secure: boolean;
};

export function createLogoutHandler({ database, secure }: LogoutHandlerDependencies) {
  return async function handleLogout(request: Request) {
    const token = getAdministratorSessionToken(request.headers.get("cookie"), { secure });
    if (token) await deleteSession(database, token);

    return new Response(null, {
      status: 303,
      headers: {
        location: "/login",
        "set-cookie": serializeAdministratorSessionCookie({ clear: true, secure, token: "" }),
      },
    });
  };
}
