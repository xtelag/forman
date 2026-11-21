import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { restoreSqliteBackup } from "@/server/backup/restore-service";
import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import {
  administrators,
  administratorSessions,
  pipelines,
  sources,
} from "@/server/db/schema";

describe("SQLite restore", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => cleanup.splice(0).reverse().forEach((dispose) => dispose()));

  test("restores a compatible baseline backup while preserving the target administrator", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-restore-"));
    cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
    const targetPath = path.join(directory, "target.sqlite");
    const candidatePath = path.join(directory, "candidate.sqlite");
    const now = new Date("2026-08-25T07:00:00.000Z");

    let target = createDatabase(targetPath);
    runMigrations(target.db);
    await target.db.insert(administrators).values({
      createdAt: now,
      id: "target-admin",
      isInitialPassword: false,
      passwordChangedAt: now,
      passwordHash: "target-password-hash",
      username: "target-user",
    });
    await target.db.insert(administratorSessions).values({
      createdAt: now,
      id: "target-session",
      lastSeenAt: now,
      tokenHash: "target-token",
    });
    await target.db.insert(sources).values({
      createdAt: now,
      sourceId: "target-only",
      id: "target-only-id",
      name: "Target-only Source",
      updatedAt: now,
    });

    const source = createDatabase(candidatePath);
    cleanup.push(source.close);
    runMigrations(source.db);
    await source.db.insert(administrators).values({
      createdAt: now,
      id: "backup-admin",
      isInitialPassword: true,
      passwordChangedAt: now,
      passwordHash: "backup-password-hash",
      username: "backup-user",
    });
    await source.db.insert(sources).values({
      createdAt: now,
      sourceId: "contact",
      id: "contact-id",
      name: "Contact",
      updatedAt: now,
    });
    await source.db.insert(pipelines).values({
      createdAt: now,
      enabled: true,
      id: "backup-pipeline",
      name: "Backup processing",
      sourceId: "contact-id",
      updatedAt: now,
    });

    await restoreSqliteBackup({
      candidatePath,
      databasePath: targetPath,
      runtime: {
        close() {
          target.close();
        },
        current() {
          return target;
        },
        open() {
          target = createDatabase(targetPath);
          return target;
        },
      },
    });
    cleanup.push(() => target.close());

    expect(await target.db.select().from(administrators)).toEqual([
      expect.objectContaining({
        id: "target-admin",
        passwordHash: "target-password-hash",
        username: "target-user",
      }),
    ]);
    expect(await target.db.select().from(administratorSessions)).toEqual([]);
    expect((await target.db.select().from(sources)).map((source) => source.sourceId)).toEqual([
      "contact",
    ]);
    expect(await target.db.select().from(pipelines)).toEqual([
      expect.objectContaining({ enabled: false, id: "backup-pipeline" }),
    ]);
  });

  test("restores the original database when opening the replacement fails", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-restore-"));
    cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
    const targetPath = path.join(directory, "target.sqlite");
    const candidatePath = path.join(directory, "candidate.sqlite");
    const now = new Date("2026-08-25T07:00:00.000Z");

    let target = createDatabase(targetPath);
    runMigrations(target.db);
    await target.db.insert(administrators).values({
      createdAt: now,
      id: "target-admin",
      isInitialPassword: false,
      passwordChangedAt: now,
      passwordHash: "target-password-hash",
      username: "target-user",
    });
    await target.db.insert(sources).values({
      createdAt: now,
      sourceId: "target-only",
      id: "target-only-id",
      name: "Target-only Source",
      updatedAt: now,
    });

    const source = createDatabase(candidatePath);
    cleanup.push(source.close);
    runMigrations(source.db);
    await source.db.insert(administrators).values({
      createdAt: now,
      id: "backup-admin",
      isInitialPassword: true,
      passwordChangedAt: now,
      passwordHash: "backup-password-hash",
      username: "backup-user",
    });
    await source.db.insert(sources).values({
      createdAt: now,
      sourceId: "candidate-only",
      id: "candidate-only-id",
      name: "Candidate-only Source",
      updatedAt: now,
    });

    let openAttempts = 0;
    await expect(
      restoreSqliteBackup({
        candidatePath,
        databasePath: targetPath,
        runtime: {
          close() {
            target.close();
          },
          current() {
            return target;
          },
          open() {
            openAttempts += 1;
            if (openAttempts === 1) throw new Error("replacement could not open");
            target = createDatabase(targetPath);
            return target;
          },
        },
      }),
    ).rejects.toThrow("replacement could not open");
    cleanup.push(() => target.close());

    expect((await target.db.select().from(sources)).map((source) => source.sourceId)).toEqual([
      "target-only",
    ]);
  });
});
