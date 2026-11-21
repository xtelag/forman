import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { enterMaintenanceMode } from "@/server/backup/maintenance-mode";
import { validateBackupCandidate } from "@/server/backup/sqlite-backup";
import type { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { drainBackgroundJobs } from "@/server/startup/background-jobs";
import { recoverInterruptedPipelineActions } from "@/server/pipelines/pipeline-run-worker";
import { pipelines } from "@/server/db/schema";

export class RestoreRecoveryError extends AggregateError {
  constructor(
    restoreError: unknown,
    rollbackError: unknown,
    readonly recoveryPath: string | undefined,
  ) {
    super(
      [restoreError, rollbackError],
      "Backup restore and rollback failed; manual recovery required",
    );
    this.name = "RestoreRecoveryError";
  }
}

type RuntimeDatabase = ReturnType<typeof createDatabase>;
type RuntimeController = {
  close: () => void;
  current: () => RuntimeDatabase;
  open: () => RuntimeDatabase;
};

type PreservedAdministrator = {
  created_at: number;
  id: string;
  is_initial_password: number;
  password_changed_at: number;
  password_hash: string;
  username: string;
};

function restoreTargetAdministrators(
  database: RuntimeDatabase,
  administrators: PreservedAdministrator[],
) {
  database.client.transaction(() => {
    database.client.prepare("delete from administrator_session").run();
    database.client.prepare("delete from administrator").run();
    const insert = database.client.prepare(`
      insert into administrator (
        id, username, password_hash, is_initial_password,
        password_changed_at, created_at
      ) values (?, ?, ?, ?, ?, ?)
    `);
    for (const administrator of administrators) {
      insert.run(
        administrator.id,
        administrator.username,
        administrator.password_hash,
        administrator.is_initial_password,
        administrator.password_changed_at,
        administrator.created_at,
      );
    }
  })();
}

async function replaceDatabase(sourcePath: string, databasePath: string) {
  const source = new Database(sourcePath, {
    fileMustExist: true,
    readonly: true,
  });
  try {
    await source.backup(databasePath);
  } finally {
    source.close();
  }
}

export async function restoreSqliteBackup({
  candidatePath,
  databasePath,
  runtime,
}: {
  candidatePath: string;
  databasePath: string;
  runtime: RuntimeController;
}) {
  validateBackupCandidate(candidatePath);
  const leaveMaintenance = enterMaintenanceMode(databasePath);
  let runtimeClosed = false;
  let replacementAttempted = false;
  let recoveryFailed = false;
  let rollbackPath: string | undefined;

  try {
    await drainBackgroundJobs(databasePath);
    const original = runtime.current();
    const administrators = original.client
      .prepare("select * from administrator")
      .all() as PreservedAdministrator[];
    if (administrators.length === 0) {
      throw new Error("The target administrator account is unavailable");
    }

    const rollbackDirectory = mkdtempSync(
      join(dirname(databasePath), ".forman-restore-"),
    );
    rollbackPath = join(rollbackDirectory, "original.sqlite");
    await original.client.backup(rollbackPath);

    runtime.close();
    runtimeClosed = true;
    replacementAttempted = true;
    await replaceDatabase(candidatePath, databasePath);

    const restored = runtime.open();
    runtimeClosed = false;
    runMigrations(restored.db);
    restoreTargetAdministrators(restored, administrators);
    recoverInterruptedPipelineActions(restored.db);
    await restored.db
      .update(pipelines)
      .set({ enabled: false, updatedAt: new Date() });
  } catch (error) {
    if (replacementAttempted && rollbackPath) {
      try {
        if (!runtimeClosed) {
          runtime.close();
          runtimeClosed = true;
        }
        await replaceDatabase(rollbackPath, databasePath);
        runtime.open();
        runtimeClosed = false;
      } catch (rollbackError) {
        recoveryFailed = true;
        throw new RestoreRecoveryError(error, rollbackError, rollbackPath);
      }
    } else if (runtimeClosed) {
      try {
        runtime.open();
        runtimeClosed = false;
      } catch (rollbackError) {
        recoveryFailed = true;
        throw new RestoreRecoveryError(error, rollbackError, rollbackPath);
      }
    }
    throw error;
  } finally {
    if (!recoveryFailed) {
      leaveMaintenance();
      if (rollbackPath)
        rmSync(dirname(rollbackPath), { force: true, recursive: true });
    }
  }
}
