import { afterEach, describe, expect, test } from "vitest";

import {
  getServerSubmissionTokenPrefix,
  issueServerSubmissionToken,
  verifyServerSubmissionToken,
} from "@/server/sources/server-token-service";
import { serverSubmissionTokens } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createSource } from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("server submission token service", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("issues one rotatable token per Source and stores it in plaintext", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Trusted intake", type: "m2m" });

    const first = await issueServerSubmissionToken(database.db, form.id);
    expect(await verifyServerSubmissionToken(database.db, form.id, first.token)).toBe(true);
    const stored = database.client.prepare("select token from server_submission_token").get() as { token: string };
    expect(stored.token).toBe(first.token);

    const second = await issueServerSubmissionToken(database.db, form.id);
    expect(second.token).not.toBe(first.token);
    await expect(verifyServerSubmissionToken(database.db, form.id, first.token)).resolves.toBe(false);
    await expect(verifyServerSubmissionToken(database.db, form.id, second.token)).resolves.toBe(true);
  });

  test("returns a three-character token prefix even when an older row has a longer prefix", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const form = await createSource(database.db, { name: "Existing token", type: "m2m" });
    await database.db
      .update(serverSubmissionTokens)
      .set({ tokenPrefix: "abcdefgh" })
      .where(eq(serverSubmissionTokens.sourceId, form.id));

    await expect(getServerSubmissionTokenPrefix(database.db, form.id)).resolves.toBe("abc");
  });
});
