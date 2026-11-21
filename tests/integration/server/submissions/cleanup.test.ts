import { afterEach, describe, expect, test } from "vitest";

import { cleanupExpiredSubmissions } from "@/server/submissions/cleanup";
import { createSource } from "@/server/sources/source-service";
import { submissions } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("cleanupExpiredSubmissions", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("removes only rows older than a form's configured retention period", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const retained = await createSource(database.db, { type: "one-shot", name: "Retained" });
    const unlimited = await createSource(database.db, { type: "one-shot", name: "Unlimited" });
    database.client.prepare("update source set retention_days = 10 where id = ?").run(retained.id);
    await database.db.insert(submissions).values([
      { id: "expired", sourceId: retained.id, payloadJson: "{}", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "fresh", sourceId: retained.id, payloadJson: "{}", createdAt: new Date("2026-01-15T00:00:00Z") },
      { id: "unlimited", sourceId: unlimited.id, payloadJson: "{}", createdAt: new Date("2026-01-01T00:00:00Z") },
    ]);

    await expect(cleanupExpiredSubmissions(database.db, new Date("2026-01-20T00:00:00Z"))).resolves.toBe(1);
    expect(database.client.prepare("select id from submission order by id").all()).toEqual([{ id: "fresh" }, { id: "unlimited" }]);
  });
});
