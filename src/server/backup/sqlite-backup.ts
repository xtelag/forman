import { sourceConfigurationDocumentSchema } from "@/server/sources/source-configuration-document";
import Database from "better-sqlite3";
import { settingsDocumentSchema } from "@/server/config/settings-document";

import {
  currentMigrationBaseline,
  currentMigrationTimestamp as currentSchemaMigrationTimestamp,
  currentSchemaTables,
} from "@/server/db/migrate";

export type BackupInspection = {
  migrationTimestamp: number;
};

export function currentMigrationTimestamp() {
  return currentSchemaMigrationTimestamp();
}

function hasCurrentSchema(candidate: Database.Database, tableNames: Set<string>, schema: Record<string, readonly string[]> = currentSchemaTables) {
  const expectedTables = ["__drizzle_migrations", ...Object.keys(schema)].sort();
  if (JSON.stringify([...tableNames].sort()) !== JSON.stringify(expectedTables)) {
    return false;
  }
  if ((candidate.pragma("foreign_key_check") as unknown[]).length !== 0) return false;
  return Object.entries(schema).every(([table, expectedColumns]) => {
    const columns = candidate
      .prepare(`pragma table_info('${table}')`)
      .all() as Array<{ name: string }>;
    return JSON.stringify(columns.map(({ name }) => name)) === JSON.stringify(expectedColumns);
  });
}

export async function createSqliteBackup(
  client: Database.Database,
  backupPath: string,
) {
  await client.backup(backupPath);
}

export function validateBackupCandidate(
  candidatePath: string,
): BackupInspection {
  let candidate: Database.Database | undefined;
  try {
    candidate = new Database(candidatePath, {
      fileMustExist: true,
      readonly: true,
    });
    const integrity = candidate.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check.toLowerCase() !== "ok"
    ) {
      throw new Error("invalid integrity");
    }
    const tableNames = new Set(
      (
        candidate
          .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
          .all() as Array<{ name: string }>
      ).map((table) => table.name),
    );
    const currentShape = hasCurrentSchema(candidate, tableNames);
    if (!currentShape) throw new Error("invalid Forman schema");
    for (const row of candidate.prepare("SELECT configuration_json FROM global_setting").all() as Array<{ configuration_json: string }>) {
      settingsDocumentSchema.parse(JSON.parse(row.configuration_json));
    }
    for (const row of candidate.prepare("SELECT configuration_json FROM source").all() as Array<{ configuration_json: string }>) {
      sourceConfigurationDocumentSchema.parse(JSON.parse(row.configuration_json));
    }
    const migration = candidate
      .prepare(
        "select max(created_at) as migrationTimestamp from __drizzle_migrations",
      )
      .get() as { migrationTimestamp: number | null };
    if (!migration.migrationTimestamp) throw new Error("missing migration");
    const baseline = currentMigrationBaseline();
    const hasBaseline = candidate
      .prepare("select 1 from __drizzle_migrations where hash = ? limit 1")
      .get(baseline.hash);
    if (!hasBaseline) throw new Error("missing current baseline");
    if (migration.migrationTimestamp > currentMigrationTimestamp()) {
      throw new Error("This backup was created by a newer Forman version");
    }
    return { migrationTimestamp: migration.migrationTimestamp };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "This backup was created by a newer Forman version"
    ) {
      throw error;
    }
    throw new Error("The selected file is not a Forman backup");
  } finally {
    candidate?.close();
  }
}
