import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/server/db/runtime";

describe("runtime database", () => {
  const original = { ...process.env };
  const directories: string[] = [];
  afterEach(() => {
    closeRuntimeDatabase();
    process.env = { ...original };
    directories.splice(0).forEach((directory) =>
      rmSync(directory, { force: true, recursive: true }),
    );
  });

  test("reopens the configured database after a restore closes it", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-runtime-"));
    directories.push(directory);
    process.env.FORMAN_BASE_ORIGIN = "https://forman.example.test";
    process.env.FORMAN_DATABASE_PATH = path.join(directory, "forman.sqlite");
    process.env.FORMAN_SESSION_SECRET = "session-secret-at-least-thirty-two-characters";
    process.env.FORMAN_ALTCHA_SECRET = "altcha-secret-at-least-thirty-two-characters";
    const first = getRuntimeDatabase();

    closeRuntimeDatabase();
    const second = getRuntimeDatabase();

    expect(second).not.toBe(first);
    expect(second.client.pragma("journal_mode", { simple: true })).toBe("wal");
  });
});
