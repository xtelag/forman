import type { createDatabase } from "@/server/db/client";
import { loadEnvironment } from "@/server/config/environment";

import { administratorSessionCookieName, getSession } from "./sessions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const value of cookieHeader.split(";")) {
    const separator = value.indexOf("=");
    if (separator === -1 || value.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(value.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function getAdministratorSessionToken(
  cookieHeader: string | null,
  { secure = loadEnvironment(process.env).baseOrigin.protocol === "https:" }: { secure?: boolean } = {},
) {
  return readCookie(cookieHeader, administratorSessionCookieName(secure));
}

export async function getAdministratorSessionFromCookie(
  database: FormanDatabase,
  cookieHeader: string | null,
  options?: { secure?: boolean },
) {
  const token = getAdministratorSessionToken(cookieHeader, options);
  return token ? getSession(database, token) : null;
}
