import { checkDatabaseAccess, databaseAccessError } from "./database-access";
import { inboxPreview } from "@/shared/inbox-preview";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { chmodSync, existsSync } from "node:fs";

function secureSqliteFiles(databasePath: string) {
  if (databasePath === ":memory:") return;
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(/* turbopackIgnore: true */ path)) {
      try { chmodSync(path, 0o600); }
      catch (error) {
        throw databaseAccessError(path, "cannot set owner-only file permissions", error);
      }
    }
  }
}

export function createDatabase(databasePath: string) {
  process.umask(0o077);
  checkDatabaseAccess(databasePath);
  secureSqliteFiles(databasePath);
  let client: Database.Database | undefined;
  try {
    client = new Database(databasePath);

    // SQLite lower() is ASCII-only. Keep literal, Unicode-aware Inbox search
    // consistent with the displayed preview, without hydrating every row.
    client.function("forman_inbox_matches", { deterministic: true },
      (id, payload, sourceName, actionName, submissionId, needle) => {
        const json = String(payload);
        const text = [id, json, inboxPreview(JSON.parse(json)), sourceName, actionName, submissionId ?? ""]
          .join("\n").toLocaleLowerCase();
        return Number(text.includes(String(needle).toLocaleLowerCase()));
      });
    client.pragma("journal_mode = WAL");
    secureSqliteFiles(databasePath);
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
  } catch (error) {
    client?.close();
    const code = (error as { code?: string }).code ?? "";
    if (databasePath !== ":memory:" && (code === "SQLITE_CANTOPEN" || code.startsWith("SQLITE_READONLY") || ["EACCES", "EPERM", "EROFS"].includes(code))) {
      throw databaseAccessError(databasePath, "SQLite could not open or write the database (" + code + ")", error);
    }
    throw error;
  }
  const opened = client;

  return {
    client: opened,
    db: drizzle(opened),
    close: () => {
      try { secureSqliteFiles(databasePath); }
      finally { opened.close(); }
    },
  };
}
