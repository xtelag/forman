import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inject } from "vitest";

import { createDatabase } from "@/server/db/client";

function createIsolatedDatabase(templatePath?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "forman-db-"));
  const databasePath = path.join(directory, "forman.sqlite");
  if (templatePath) copyFileSync(templatePath, databasePath);
  const database = createDatabase(databasePath);
  let disposed = false;

  return {
    ...database,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        database.close();
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
  };
}

export function createTestDatabase() {
  return createIsolatedDatabase(inject("testDatabaseTemplatePath"));
}

export function createUnmigratedTestDatabase() {
  return createIsolatedDatabase();
}
