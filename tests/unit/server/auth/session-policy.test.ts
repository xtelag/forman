import { expect, test } from "vitest";
import { administratorSessionPolicy } from "@/server/auth/session-policy";
import { getSession, createSession } from "@/server/auth/sessions";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";
test("reads persisted policy changes immediately for existing sessions", async () => {
  const db = createTestDatabase();
  runMigrations(db.db);
  try {
    expect(await administratorSessionPolicy(db.db)).toEqual({
      idleMs: 7 * 86400_000,
      absoluteMs: 30 * 86400_000,
    });
    const now = new Date();
    const token = await createSession(db.db, new Date(+now - 3 * 86400_000));
    expect(await getSession(db.db, token, now)).not.toBeNull();
    await updateGlobalSettings(db.db, {
      adminSessionIdleDays: 2,
      adminSessionAbsoluteDays: 10,
    });
    expect(await administratorSessionPolicy(db.db)).toEqual({
      idleMs: 2 * 86400_000,
      absoluteMs: 10 * 86400_000,
    });
    expect(await getSession(db.db, token, now)).toBeNull();
  } finally {
    db.dispose();
  }
});
