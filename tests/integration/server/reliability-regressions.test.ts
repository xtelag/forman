import { mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import Database from "better-sqlite3";
import { runBackgroundJob } from "@/server/startup/background-jobs";
import { cleanupExpiredSubmissions } from "@/server/submissions/cleanup";
import { test, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  renameSync,
  mkdirSync,
} from "node:fs";

import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { loadEnvironment } from "@/server/config/environment";
import { restoreSqliteBackup } from "@/server/backup/restore-service";
import { createSource } from "@/server/sources/source-service";
import {
  deleteMatchingSubmissions,
  deleteSubmission,
  deleteSubmissions,
} from "@/server/submissions/query-service";
import { operateSession } from "@/server/source-sessions/session-service";
import { sources } from "@/server/db/schema";
import { eq } from "drizzle-orm";

test("runs scheduled jobs against the replacement database after restore", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forman-audit-"));
  const targetPath = path.join(dir, "target.sqlite");
  const candidatePath = path.join(dir, "candidate.sqlite");
  let target = createDatabase(targetPath);
  const candidate = createDatabase(candidatePath);
  try {
    runMigrations(candidate.db);
    let worker!: () => Promise<void>;
    let cleanup!: () => Promise<void>;
    await createStartupBootstrap({
      database: target.db,
      getDatabase: () => target.db,
      environment: loadEnvironment({
        FORMAN_BASE_ORIGIN: "https://forman.example.test",
        FORMAN_DATABASE_PATH: targetPath,
        FORMAN_SESSION_SECRET: "audit-secret-that-is-at-least-thirty-two-chars",
        FORMAN_ALTCHA_SECRET: "audit-altcha-that-is-at-least-thirty-two-chars",
        FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
        NODE_ENV: "test",
      }),
      write: () => {},
      schedulePipelineWorker: (job) => {
        worker = job;
      },
      scheduleCleanup: (job) => {
        cleanup = job;
      },
    }).start();
    await worker();
    let release!: () => void;
    let finished = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runBackgroundJob(targetPath, async () => {
      await gate;
      target.client.prepare("select 1").get();
      finished = true;
    });
    const restoring = restoreSqliteBackup({
      candidatePath,
      databasePath: targetPath,
      runtime: {
        current: () => target,
        close: () => {
          expect(finished).toBe(true);
          target.close();
        },
        open: () => (target = createDatabase(targetPath)),
      },
    });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      expect(target.client.open).toBe(true);
      let startedDuringMaintenance = false;
      await runBackgroundJob(targetPath, async () => {
        startedDuringMaintenance = true;
      });
      expect(startedDuringMaintenance).toBe(false);
    } finally {
      release();
      await running;
      await restoring;
    }
    expect(readdirSync(dir)).not.toContain("target.sqlite.maintenance");
    expect(target.client.prepare("select 1 as ok").get()).toEqual({ ok: 1 });
    await expect(worker()).resolves.toBeUndefined();
    await expect(cleanup()).resolves.toBeUndefined();
  } finally {
    target.close();
    candidate.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each(["filtered", "explicit", "excluded"])(
  "deletes a %s selection larger than the SQLite parameter limit",
  async (mode) => {
    const dir = mkdtempSync(path.join(tmpdir(), "forman-audit-"));
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      runMigrations(db.db);
      const source = await createSource(db.db, {
        name: "Audit bulk",
        type: "one-shot",
      });
      const entry = db.client.pragma("compile_options") as {
        compile_options: string;
      }[];
      const limit = Number(
        entry
          .find((x) => x.compile_options.startsWith("MAX_VARIABLE_NUMBER="))!
          .compile_options.split("=")[1],
      );
      const insert = db.client.prepare(
        "insert into submission (id,source_id,payload_json,created_at) values (?, ?, '{}', ?)",
      );
      db.client.transaction(() => {
        for (let i = 0; i <= limit; i++) insert.run("row-" + i, source.id, 1);
      })();
      const ids = Array.from({ length: limit + 1 }, (_, i) => "row-" + i);
      if (mode === "explicit")
        expect(await deleteSubmissions(db.db, ids)).toBe(limit + 1);
      else {
        if (mode === "excluded") {
          expect(
            await deleteMatchingSubmissions(db.db, {
              excludedIds: ids.slice(1),
            }),
          ).toBe(1);
          expect(
            await deleteMatchingSubmissions(db.db, {
              snapshotBefore: new Date(),
            }),
          ).toBe(limit);
        } else
          expect(
            await deleteMatchingSubmissions(db.db, {
              snapshotBefore: new Date(),
            }),
          ).toBe(limit + 1);
      }
      expect(
        (
          db.client.prepare("select count(*) as n from submission").get() as {
            n: number;
          }
        ).n,
      ).toBe(0);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.each(["single", "explicit", "filtered", "retention", "rollback"])(
  "invalidates the session capability after %s deletion",
  async (mode) => {
    const dir = mkdtempSync(path.join(tmpdir(), "forman-audit-"));
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      runMigrations(db.db);
      const source = await createSource(db.db, {
        name: "Audit session",
        type: "session",
      });
      mutateSourceConfiguration(db.db, source.id, () => ({ altchaEnabled: false }));
      const common = { database: db.db, source, keyHash: "audit-key" };
      expect(
        (await operateSession({ ...common, body: { operation: "open" } }))
          .status,
      ).toBe(201);
      const final = await operateSession({
        ...common,
        body: {
          operation: "update",
          operationId: "audit-operation-123",
          revision: 0,
          final: true,
          payload: { email: "retained@example.test" },
        },
      });
      expect(final.status).toBe(200);
      const id = final.data!.submissionId!;
      if (mode === "rollback") {
        db.client.exec(
          "create trigger prevent_delete before delete on submission begin select raise(abort, 'blocked'); end;",
        );
        await expect(deleteSubmission(db.db, id)).rejects.toThrow("blocked");
        expect(
          db.client.prepare("select payload_json from source_session").get(),
        ).toEqual({ payload_json: '{"email":"retained@example.test"}' });
        expect(
          db.client
            .prepare("select count(*) as n from source_session_operation")
            .get(),
        ).toEqual({ n: 1 });
        expect(
          (await operateSession({ ...common, body: { operation: "read" } }))
            .status,
        ).toBe(200);
        return;
      }
      if (mode === "single")
        expect(await deleteSubmission(db.db, id)).toBe(true);
      if (mode === "explicit")
        expect(await deleteSubmissions(db.db, [id])).toBe(1);
      if (mode === "filtered")
        expect(
          await deleteMatchingSubmissions(db.db, { sourceId: source.id }),
        ).toBe(1);
      if (mode === "retention") {
        db.db
          .update(sources)
          .set({ retentionDays: 1 })
          .where(eq(sources.id, source.id))
          .run();
        expect(
          await cleanupExpiredSubmissions(
            db.db,
            new Date(Date.now() + 2 * 86400000),
          ),
        ).toBe(1);
      }
      expect(
        db.client.prepare("select payload_json from source_session").get(),
      ).toEqual({ payload_json: "{}" });
      expect(
        db.client
          .prepare("select count(*) as n from source_session_operation")
          .get(),
      ).toEqual({ n: 0 });
      const read = await operateSession({
        ...common,
        body: { operation: "read" },
      });
      expect(read.status).toBe(410);
      expect(
        db.client.prepare("select payload_json from source_session").get(),
      ).toEqual({ payload_json: "{}" });
      expect(
        db.client
          .prepare("select count(*) as n from source_session_operation")
          .get(),
      ).toEqual({ n: 0 });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("preserves the recovery copy and maintenance lock when rollback fails", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "forman-audit-"));
  const targetPath = path.join(dir, "target.sqlite");
  const candidatePath = path.join(dir, "candidate.sqlite");
  const target = createDatabase(targetPath);
  const candidate = createDatabase(candidatePath);
  let closed = false;
  try {
    runMigrations(target.db);
    runMigrations(candidate.db);
    target.client
      .prepare(
        "insert into administrator (id,username,password_hash,is_initial_password,password_changed_at,created_at) values ('admin','forman','hash',0,1,1)",
      )
      .run();
    await expect(
      restoreSqliteBackup({
        candidatePath,
        databasePath: targetPath,
        runtime: {
          current: () => target,
          close: () => {
            target.close();
            closed = true;
          },
          open: () => {
            renameSync(targetPath, path.join(dir, "failed-replacement.sqlite"));
            mkdirSync(targetPath);
            throw new Error("simulated storage failure");
          },
        },
      }),
    ).rejects.toThrow(/rollback/i);
    expect(
      readdirSync(dir).filter((name) => name.startsWith(".forman-restore-")),
    ).toHaveLength(1);
    expect(readdirSync(dir)).toContain("target.sqlite.maintenance");
    const backupDirectory = readdirSync(dir).find((name) =>
      name.startsWith(".forman-restore-"),
    )!;
    const recovery = new Database(
      path.join(dir, backupDirectory, "original.sqlite"),
      { readonly: true, fileMustExist: true },
    );
    try {
      expect(
        recovery.prepare("select username from administrator").get(),
      ).toEqual({ username: "forman" });
    } finally {
      recovery.close();
    }
  } finally {
    if (!closed) target.close();
    candidate.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
