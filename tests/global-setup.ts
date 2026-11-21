import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

export default function setupTestDatabaseTemplate({ provide }: TestProject) {
  const directory = mkdtempSync(path.join(tmpdir(), "forman-db-template-"));
  const templatePath = path.join(directory, "forman.sqlite");
  const database = createDatabase(templatePath);
  let ready = false;

  try {
    runMigrations(database.db);
    database.client.pragma("wal_checkpoint(TRUNCATE)");
    database.client.pragma("journal_mode = DELETE");
    ready = true;
  } finally {
    database.close();
    if (!ready) rmSync(directory, { force: true, recursive: true });
  }

  provide("testDatabaseTemplatePath", templatePath);

  return () => {
    rmSync(directory, { force: true, recursive: true });
  };
}
