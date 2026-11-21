import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createDatabase } from "@/server/db/client";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("createDatabase", () => {
  test("enables SQLite safety pragmas for the persistent store", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-db-"));
    temporaryDirectories.push(directory);

    const database = createDatabase(path.join(directory, "forman.sqlite"));

    expect(database.client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(database.client.pragma("busy_timeout", { simple: true })).toBe(5000);

    database.close();
  });

  test("restricts the process mask and every SQLite file to owner access", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-db-mode-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "forman.sqlite");
    const seeded = createDatabase(databasePath);
    seeded.close();
    chmodSync(databasePath, 0o644);
    const originalUmask = process.umask(0o022);

    try {
      const database = createDatabase(databasePath);
      database.client.exec("create table permission_probe (id text primary key)");
      expect(process.umask()).toBe(0o077);
      expect(statSync(databasePath).mode & 0o777).toBe(0o600);
      expect(statSync(`${databasePath}-wal`).mode & 0o777).toBe(0o600);
      expect(statSync(`${databasePath}-shm`).mode & 0o777).toBe(0o600);
      database.close();
    } finally {
      process.umask(originalUmask);
    }
  });

  test("supports in-memory SQLite without filesystem paths", () => {
    const database = createDatabase(":memory:");
    expect(database.client.pragma("journal_mode", { simple: true })).toBe("memory");
    database.close();
  });
});

test("explains a missing database directory without creating it", () => {
 const directory = mkdtempSync(path.join(tmpdir(), "forman-missing-"));
 temporaryDirectories.push(directory);
 expect(() => createDatabase(path.join(directory, "missing", "forman.sqlite")))
   .toThrow(/missing.*does not exist.*UID.*GID/);
});

test("rejects a directory used as the database file", () => {
 const directory = mkdtempSync(path.join(tmpdir(), "forman-invalid-"));
 temporaryDirectories.push(directory);
 expect(() => createDatabase(directory)).toThrow(/is not a regular file/);
});

test.skipIf(process.getuid?.() === 0)("explains an unwritable directory before SQLite opens a file", () => {
 const directory = mkdtempSync(path.join(tmpdir(), "forman-denied-"));
 temporaryDirectories.push(directory);
 chmodSync(directory, 0o500);
 try {
  expect(() => createDatabase(path.join(directory, "forman.sqlite")))
    .toThrow("Data directory " + JSON.stringify(directory) + " is not accessible for UID " + process.getuid!() + ", GID " + process.getgid!());
 } finally { chmodSync(directory, 0o700); }
});

test.skipIf(process.getuid?.() === 0)("reports the exact inaccessible database or WAL file", () => {
 for (const suffix of ["", "-wal", "-shm"]) {
  const directory = mkdtempSync(path.join(tmpdir(), "forman-file-denied-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, "forman.sqlite" + suffix);
  writeFileSync(file, "", { mode: 0o400 });
  try {
   expect(() => createDatabase(path.join(directory, "forman.sqlite")))
     .toThrow("Database file " + JSON.stringify(file) + " is not accessible for UID " + process.getuid!() + ", GID " + process.getgid!());
  } finally { chmodSync(file, 0o600); }
 }
});
