import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  enterMaintenanceMode,
  isMaintenanceMode,
} from "@/server/backup/maintenance-mode";

describe("backup maintenance mode", () => {
  const directories: string[] = [];
  afterEach(() =>
    directories
      .splice(0)
      .forEach((directory) => rmSync(directory, { force: true, recursive: true })),
  );

  test("uses an exclusive private marker beside the database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-maintenance-"));
    directories.push(directory);
    const databasePath = path.join(directory, "forman.sqlite");

    const leave = enterMaintenanceMode(databasePath);

    expect(isMaintenanceMode(databasePath)).toBe(true);
    expect(statSync(`${databasePath}.maintenance`).mode & 0o777).toBe(0o600);
    expect(() => enterMaintenanceMode(databasePath)).toThrow(
      "A backup restore is already in progress",
    );

    leave();
    expect(isMaintenanceMode(databasePath)).toBe(false);
  });
});
