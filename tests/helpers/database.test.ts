import { afterEach, describe, expect, test } from "vitest";

import { currentMigrationTimestamp } from "@/server/backup/sqlite-backup";
import { runMigrations } from "@/server/db/migrate";
import {
  createTestDatabase,
  createUnmigratedTestDatabase,
} from "./database";

describe("test database helpers", () => {
  const databases: Array<ReturnType<typeof createTestDatabase>> = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("clones the current migrated schema into isolated databases", () => {
    const first = createTestDatabase();
    const second = createTestDatabase();
    databases.push(first, second);

    const migration = first.client
      .prepare("select max(created_at) as createdAt from __drizzle_migrations")
      .get() as { createdAt: number };
    expect(migration.createdAt).toBe(currentMigrationTimestamp());

    first.client.exec("create table clone_marker (id text primary key)");
    expect(
      second.client
        .prepare(
          "select name from sqlite_master where type = 'table' and name = 'clone_marker'",
        )
        .get(),
    ).toBeUndefined();
  });

  test("creates a truly unmigrated database that migrations can initialize", () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);

    expect(
      database.client
        .prepare(
          "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
        )
        .get(),
    ).toBeUndefined();

    runMigrations(database.db);

    expect(
      database.client
        .prepare(
          "select name from sqlite_master where type = 'table' and name = 'source'",
        )
        .get(),
    ).toEqual({ name: "source" });
  });
});
