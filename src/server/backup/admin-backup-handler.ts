import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import { decodeBackup, encryptBackup } from "@/server/backup/backup-envelope";
import { RestoreRecoveryError, restoreSqliteBackup } from "@/server/backup/restore-service";
import { createSqliteBackup } from "@/server/backup/sqlite-backup";
import type { createDatabase } from "@/server/db/client";

const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
type RuntimeDatabase = ReturnType<typeof createDatabase>;
type RuntimeController = {
  close: () => void;
  current: () => RuntimeDatabase;
  open: () => RuntimeDatabase;
};

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function backupError(error: unknown, fallback: string) {
  const safeMessages = new Set([
    "A backup restore is already in progress",
    "Backup password must contain at least 12 characters",
    "The backup password is incorrect or the file is damaged",
    "The selected file is not a Forman backup",
    "This backup format is not supported",
    "This backup requires a password",
    "This backup was created by a newer Forman version",
  ]);
  const message = error instanceof Error ? error.message : "";
  return safeMessages.has(message) ? message : fallback;
}

async function authenticated(request: Request, runtime: RuntimeController) {
  return Boolean(
    await getAdministratorSessionFromCookie(
      runtime.current().db,
      request.headers.get("cookie"),
    ),
  );
}

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "forman-backup-"));
  chmodSync(directory, 0o700);
  return directory;
}

function backupFilename(encrypted: boolean) {
  const date = new Date().toISOString().slice(0, 10);
  return `forman-backup-${date}.${encrypted ? "forman-backup" : "sqlite"}`;
}

function isBackupUpload(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value !== "string" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.size === "number",
  );
}

export function createAdminBackupHandler({
  databasePath,
  runtime,
}: {
  databasePath: string;
  runtime: RuntimeController;
}) {
  return {
    async export(request: Request) {
      if (!(await authenticated(request, runtime))) return unauthorized();
      const values = (await request.json().catch(() => ({}))) as {
        password?: unknown;
      };
      const password = typeof values.password === "string" ? values.password : "";
      const directory = temporaryDirectory();
      try {
        const sqlitePath = path.join(directory, "backup.sqlite");
        await createSqliteBackup(runtime.current().client, sqlitePath);
        chmodSync(sqlitePath, 0o600);
        const sqlite = readFileSync(sqlitePath);
        const output = password ? await encryptBackup(sqlite, password) : sqlite;
        const filename = backupFilename(Boolean(password));
        return new Response(new Uint8Array(output), {
          headers: {
            "cache-control": "no-store",
            "content-disposition": `attachment; filename="${filename}"`,
            "content-length": String(output.length),
            "content-type": "application/octet-stream",
          },
        });
      } catch (error) {
        return Response.json(
          { error: backupError(error, "Backup could not be created") },
          { status: 400 },
        );
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },

    async restore(request: Request) {
      if (!(await authenticated(request, runtime))) return unauthorized();
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_BACKUP_BYTES) {
        return Response.json({ error: "Backup file is too large" }, { status: 413 });
      }
      const directory = temporaryDirectory();
      try {
        const form = await request.formData();
        const upload = form.get("backup");
        if (!isBackupUpload(upload)) {
          return Response.json({ error: "Select a backup file" }, { status: 400 });
        }
        if (upload.size > MAX_BACKUP_BYTES) {
          return Response.json({ error: "Backup file is too large" }, { status: 413 });
        }
        const passwordValue = form.get("password");
        const password = typeof passwordValue === "string" ? passwordValue : undefined;
        const decoded = await decodeBackup(
          Buffer.from(await upload.arrayBuffer()),
          password || undefined,
        );
        const candidatePath = path.join(directory, "candidate.sqlite");
        writeFileSync(candidatePath, decoded, { mode: 0o600 });
        await restoreSqliteBackup({ candidatePath, databasePath, runtime });
        return new Response(null, { status: 204 });
      } catch (error) {
        if (error instanceof RestoreRecoveryError) {
          console.error("Forman backup recovery requires manual intervention", {
            recoveryPath: error.recoveryPath,
            failures: error.errors.map((failure: unknown) => ({
              name: failure instanceof Error ? failure.name : "UnknownError",
              code: (failure as NodeJS.ErrnoException | null)?.code,
            })),
          });
        }
        return Response.json(
          { error: error instanceof RestoreRecoveryError
            ? "Backup recovery failed. Maintenance remains active; contact the server administrator."
            : backupError(error, "Backup could not be restored") },
          { status: error instanceof RestoreRecoveryError ? 503 : 400 },
        );
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
  };
}
