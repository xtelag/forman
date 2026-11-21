import { inArray, type SQL } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import {
  submissions,
  sourceSessions,
  sourceSessionOperations,
} from "@/server/db/schema";

type Database = Pick<ReturnType<typeof createDatabase>["db"], "transaction">;

export function deleteSubmissionsWhere(
  database: Database,
  where: SQL | undefined,
) {
  return database.transaction((transaction) => {
    const selected = transaction
      .select({ id: submissions.id })
      .from(submissions)
      .where(where);
    const sessions = transaction
      .select({ id: sourceSessions.id })
      .from(sourceSessions)
      .where(inArray(sourceSessions.submissionId, selected));
    transaction
      .delete(sourceSessionOperations)
      .where(inArray(sourceSessionOperations.sessionId, sessions))
      .run();
    // Keep a tombstone so the original capability cannot open a new session.
    transaction
      .update(sourceSessions)
      .set({ status: "expired", payloadJson: "{}" })
      .where(inArray(sourceSessions.submissionId, selected))
      .run();
    return transaction.delete(submissions).where(where).run().changes;
  });
}
