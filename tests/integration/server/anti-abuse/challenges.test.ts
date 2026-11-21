import { afterEach, describe, expect, test } from "vitest";

import { consumeChallenge, deleteExpiredChallenges } from "@/server/anti-abuse/challenges";
import { createSource } from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("consumed challenges", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("accepts a nonce once and removes expired replay records", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { type: "one-shot", name: "Contact" });

    expect(
      await consumeChallenge(database.db, {
        challengeId: "nonce-1",
        expiresAt: new Date(Date.now() + 60_000),
        sourceId: form.id,
      }),
    ).toBe(true);
    expect(
      await consumeChallenge(database.db, {
        challengeId: "nonce-1",
        expiresAt: new Date(Date.now() + 60_000),
        sourceId: form.id,
      }),
    ).toBe(false);

    await consumeChallenge(database.db, {
      challengeId: "expired-nonce",
      expiresAt: new Date(Date.now() - 1),
      sourceId: form.id,
    });
    await deleteExpiredChallenges(database.db, new Date());

    expect(
      database.client.prepare("select count(*) as count from consumed_challenge").get(),
    ).toEqual({ count: 1 });
  });
});
