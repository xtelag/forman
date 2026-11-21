import { createHash, randomBytes } from "node:crypto";

import { administratorSessionPolicy } from "./session-policy";

import { eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { administratorSessions } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(
  database: FormanDatabase,
  now = new Date(),
) {
  const token = randomBytes(32).toString("base64url");

  await database.insert(administratorSessions).values({
    id: randomBytes(16).toString("base64url"),
    tokenHash: hashToken(token),
    createdAt: now,
    lastSeenAt: now,
  });

  return token;
}

export async function getSession(
  database: FormanDatabase,
  token: string,
  now = new Date(),
  { touch = false }: { touch?: boolean } = {},
) {
  const { idleMs, absoluteMs } = await administratorSessionPolicy(database);
  const tokenHash = hashToken(token);
  const session = await database
    .select()
    .from(administratorSessions)
    .where(eq(administratorSessions.tokenHash, tokenHash))
    .get();

  if (!session) {
    return null;
  }

  if (
    now.getTime() - session.lastSeenAt.getTime() >= idleMs ||
    now.getTime() - session.createdAt.getTime() >= absoluteMs
  ) {
    await database
      .delete(administratorSessions)
      .where(eq(administratorSessions.id, session.id));
    return null;
  }

  if (touch)
    await database
      .update(administratorSessions)
      .set({ lastSeenAt: now })
      .where(eq(administratorSessions.id, session.id));

  return session;
}

export async function deleteSession(database: FormanDatabase, token: string) {
  await database
    .delete(administratorSessions)
    .where(eq(administratorSessions.tokenHash, hashToken(token)));
}

export function administratorSessionCookieName(secure: boolean) {
  return secure ? "__Host-forman_session" : "forman_session";
}

export function serializeAdministratorSessionCookie({
  clear = false,
  maxAgeSeconds = 30 * 86400,
  secure,
  token,
}: {
  clear?: boolean;
  maxAgeSeconds?: number;
  secure: boolean;
  token: string;
}) {
  return [
    `${administratorSessionCookieName(secure)}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    clear ? "Max-Age=0" : `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    secure ? "Secure" : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}
