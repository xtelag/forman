import type { createDatabase } from "@/server/db/client";

import { changeAdministratorPassword } from "./password-change";
import { getAdministratorSessionFromCookie } from "./request-auth";
import { serializeAdministratorSessionCookie } from "./sessions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type PasswordChangeHandlerDependencies = {
  database: FormanDatabase;
  secure: boolean;
};

function redirect(location: string, secure: boolean) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      "set-cookie": serializeAdministratorSessionCookie({ clear: true, secure, token: "" }),
    },
  });
}

export function createPasswordChangeHandler({ database, secure }: PasswordChangeHandlerDependencies) {
  return async function handlePasswordChange(request: Request) {
    if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie"), { secure }))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData().catch(() => null);
    const confirmPassword = formData?.get("confirmPassword");
    const currentPassword = formData?.get("currentPassword");
    const nextPassword = formData?.get("nextPassword");
    if (typeof nextPassword !== "string" || nextPassword !== confirmPassword) {
      return redirect("/app/settings?error=password", secure);
    }
    const changed = await changeAdministratorPassword(
      database,
      typeof currentPassword === "string" ? currentPassword : "",
      nextPassword,
    );
    return changed ? redirect("/login?password=changed", secure) : redirect("/app/settings?error=password", secure);
  };
}
