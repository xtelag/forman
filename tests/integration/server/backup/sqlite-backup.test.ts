import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  createSqliteBackup,
  currentMigrationTimestamp,
  validateBackupCandidate,
} from "@/server/backup/sqlite-backup";
import { runMigrations } from "@/server/db/migrate";
import { saveSmtpSettings } from "@/server/config/smtp-settings";
import { getGlobalSettings } from "@/server/config/global-settings";
import { sources } from "@/server/db/schema";
import {
  createTestDatabase,
  createUnmigratedTestDatabase,
} from "../../../helpers/database";

describe("SQLite backup", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => cleanup.splice(0).reverse().forEach((dispose) => dispose()));

  test("creates a consistent online SQLite copy", async () => {
    const database = createTestDatabase();
    cleanup.push(database.dispose);
    runMigrations(database.db);
    const now = new Date();
    await database.db.insert(sources).values({
      createdAt: now,
      sourceId: "backup-form",
      id: "backup-form-id",
      name: "Backup form",
      updatedAt: now,
    });
    const directory = mkdtempSync(path.join(tmpdir(), "forman-backup-test-"));
    cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
    const backupPath = path.join(directory, "backup.sqlite");

    await saveSmtpSettings(database.db, {
      from: "backup@example.test", fromName: "Telag", host: "localhost",
      port: 1025, encryption: "none", authentication: false,
      password: "saved-but-disabled",
    });
    await createSqliteBackup(database.client, backupPath);

    const backup = new Database(backupPath, { readonly: true });
    cleanup.push(() => backup.close());
    expect(
      backup.prepare("select name from source where id = ?").get("backup-form-id"),
    ).toEqual({ name: "Backup form" });
    const settings = backup.prepare("SELECT configuration_json FROM global_setting").get() as { configuration_json: string };
    expect(JSON.parse(settings.configuration_json)).toMatchObject({
      smtpFromName: "Telag", smtpPassword: "saved-but-disabled", smtpAuthentication: false,
    });
    expect(validateBackupCandidate(backupPath)).toMatchObject({
      migrationTimestamp: currentMigrationTimestamp(),
    });
  });

  test("rejects structurally valid JSON with invalid configuration values", () => {
    const database = createTestDatabase();
    cleanup.push(database.dispose);
    getGlobalSettings(database.db);
    database.client.prepare("UPDATE global_setting SET configuration_json = ?")
      .run(JSON.stringify({ adminSessionIdleDays: 0 }));
    expect(() => validateBackupCandidate(database.client.name)).toThrow("The selected file is not a Forman backup");
  });

  test("rejects an older schema with missing current columns", () => {
    const database = createTestDatabase(); cleanup.push(database.dispose);
    database.client.exec("ALTER TABLE source DROP COLUMN configuration_json");
    expect(() => validateBackupCandidate(database.client.name)).toThrow("The selected file is not a Forman backup");
  });

  test("rejects a damaged or unrelated SQLite file", () => {
    const database = createUnmigratedTestDatabase();
    cleanup.push(database.dispose);

    expect(() => validateBackupCandidate(database.client.name)).toThrow(
      "The selected file is not a Forman backup",
    );
  });

  test("rejects a backup created by a newer schema", () => {
    const database = createTestDatabase();
    cleanup.push(database.dispose);
    runMigrations(database.db);
    database.client
      .prepare("update __drizzle_migrations set created_at = ?")
      .run(currentMigrationTimestamp() + 1);

    expect(() => validateBackupCandidate(database.client.name)).toThrow(
      "This backup was created by a newer Forman version",
    );
  });

  test("rejects a backup from before the current baseline", () => {
    const database = createTestDatabase();
    cleanup.push(database.dispose);
    runMigrations(database.db);
    database.client
      .prepare("update __drizzle_migrations set hash = ?, created_at = ?")
      .run("retired-history", currentMigrationTimestamp() - 1);

    expect(() => validateBackupCandidate(database.client.name)).toThrow(
      "The selected file is not a Forman backup",
    );
  });

  test("rejects a backup with a baseline journal but a missing Forman table", () => {
    const database = createTestDatabase();
    cleanup.push(database.dispose);
    runMigrations(database.db);
    database.client.pragma("foreign_keys = OFF");
    database.client.exec("drop table submission");

    expect(() => validateBackupCandidate(database.client.name)).toThrow(
      "The selected file is not a Forman backup",
    );
  });
});
