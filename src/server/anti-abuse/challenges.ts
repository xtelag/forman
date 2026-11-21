import { lt } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import { consumedChallenges } from "@/server/db/schema";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type ConsumeChallengeInput = {
  challengeId: string;
  expiresAt: Date;
  sourceId: string;
};

export async function consumeChallenge(database: FormanDatabase, values: ConsumeChallengeInput) {
  const result = await database
    .insert(consumedChallenges)
    .values({ ...values, consumedAt: new Date() })
    .onConflictDoNothing()
    .run();

  return result.changes === 1;
}

export async function deleteExpiredChallenges(database: FormanDatabase, now: Date) {
  await database.delete(consumedChallenges).where(lt(consumedChallenges.expiresAt, now));
}
