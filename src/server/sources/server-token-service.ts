import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { serverSubmissionTokens } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export async function issueServerSubmissionToken(database: FormanDatabase, sourceId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const existing = await database
    .select({ sourceId: serverSubmissionTokens.sourceId })
    .from(serverSubmissionTokens)
    .where(eq(serverSubmissionTokens.sourceId, sourceId))
    .get();

  await database
    .insert(serverSubmissionTokens)
    .values({
      sourceId,
      issuedAt: now,
      rotatedAt: null,
      token,
      tokenPrefix: token.slice(0, 3),
    })
    .onConflictDoUpdate({
      target: serverSubmissionTokens.sourceId,
      set: {
        issuedAt: now,
        rotatedAt: existing ? now : null,
        token,
        tokenPrefix: token.slice(0, 3),
      },
    });

  return { token, prefix: token.slice(0, 3) };
}

export async function getServerSubmissionToken(database: FormanDatabase, sourceId: string) {
  const record = await database
    .select({ token: serverSubmissionTokens.token, tokenPrefix: serverSubmissionTokens.tokenPrefix })
    .from(serverSubmissionTokens)
    .where(eq(serverSubmissionTokens.sourceId, sourceId))
    .get();

  return record ? { token: record.token, prefix: record.tokenPrefix } : null;
}

export async function getServerSubmissionTokenPrefix(database: FormanDatabase, sourceId: string) {
  const record = await database
    .select({ prefix: serverSubmissionTokens.tokenPrefix })
    .from(serverSubmissionTokens)
    .where(eq(serverSubmissionTokens.sourceId, sourceId))
    .get();

  return record?.prefix.slice(0, 3) ?? null;
}

export async function verifyServerSubmissionToken(
  database: FormanDatabase,
  sourceId: string,
  token: string,
) {
  const record = await database
    .select({ token: serverSubmissionTokens.token })
    .from(serverSubmissionTokens)
    .where(eq(serverSubmissionTokens.sourceId, sourceId))
    .get();
  if (!record) return false;

  const actual = Buffer.from(token);
  const expected = Buffer.from(record.token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
