// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createAdminBackupHandler } from "@/server/backup/admin-backup-handler";
import { decodeBackup, isEncryptedBackup } from "@/server/backup/backup-envelope";
import { validateBackupCandidate } from "@/server/backup/sqlite-backup";
import { getGlobalSettings, updateGlobalSettings } from "@/server/config/global-settings";
import { saveSmtpSettings } from "@/server/config/smtp-settings";
import { mutateSourceConfiguration, sourceById } from "@/server/sources/source-configuration-document";
import { createSession } from "@/server/auth/sessions";
import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { administrators, sources, sourceSessions, submissions, pipelines, pages, tags, sourceTags, administratorSessions } from "@/server/db/schema";

describe("admin backup handler", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => cleanup.splice(0).reverse().forEach((dispose) => dispose()));

  function setup() {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-backup-handler-"));
    cleanup.push(() => rmSync(directory, { force: true, recursive: true }));
    const databasePath = path.join(directory, "forman.sqlite");
    let database = createDatabase(databasePath);
    runMigrations(database.db);
    const runtime = {
      close() {
        database.close();
      },
      current() {
        return database;
      },
      open() {
        database = createDatabase(databasePath);
        return database;
      },
    };
    cleanup.push(() => {
      try {
        database.close();
      } catch {
        // A failed test may already have closed it.
      }
    });
    return { databasePath, directory, runtime };
  }

  async function authorize(runtime: ReturnType<typeof setup>["runtime"]) {
    const now = new Date("2026-08-21T07:00:00.000Z");
    await runtime.current().db.insert(administrators).values({
      createdAt: now,
      id: "admin",
      isInitialPassword: false,
      passwordChangedAt: now,
      passwordHash: "password-hash",
      username: "forman",
    });
    const token = await createSession(runtime.current().db);
    return `__Host-forman_session=${encodeURIComponent(token)}`;
  }

  function restoreRequest({
    bytes,
    cookie,
    filename,
    password,
  }: {
    bytes: Buffer;
    cookie: string;
    filename: string;
    password?: string;
  }) {
    const boundary = "forman-backup-test-boundary";
    const chunks = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="backup"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      bytes,
      Buffer.from("\r\n"),
    ];
    if (password !== undefined) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="password"\r\n\r\n${password}\r\n`,
        ),
      );
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return new Request("https://forman.test/restore", {
      body: new Uint8Array(Buffer.concat(chunks)),
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      method: "POST",
    });
  }

  test("requires an administrator session", async () => {
    const { databasePath, runtime } = setup();
    const handler = createAdminBackupHandler({ databasePath, runtime });

    expect(
      (await handler.export(new Request("https://forman.test/export", { method: "POST" }))).status,
    ).toBe(401);
    expect(
      (await handler.restore(new Request("https://forman.test/restore", { method: "POST" }))).status,
    ).toBe(401);
  });

  test("downloads plaintext or password-encrypted complete SQLite backups", async () => {
    const { databasePath, runtime } = setup();
    const cookie = await authorize(runtime);
    const now = new Date();
    await runtime.current().db.insert(sources).values({
      createdAt: now,
      sourceId: "exported-form",
      id: "exported-form-id",
      name: "Exported form",
      updatedAt: now,
    });
    const handler = createAdminBackupHandler({ databasePath, runtime });

    const plaintext = await handler.export(
      new Request("https://forman.test/export", {
        body: JSON.stringify({}),
        headers: { cookie, "content-type": "application/json" },
        method: "POST",
      }),
    );
    const encrypted = await handler.export(
      new Request("https://forman.test/export", {
        body: JSON.stringify({ password: "correct horse battery staple" }),
        headers: { cookie, "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(plaintext.status).toBe(200);
    expect(plaintext.headers.get("cache-control")).toBe("no-store");
    expect(plaintext.headers.get("content-disposition")).toMatch(/\.sqlite"$/);
    expect(encrypted.headers.get("content-disposition")).toMatch(/\.forman-backup"$/);
    const plainBytes = Buffer.from(await plaintext.arrayBuffer());
    const encryptedBytes = Buffer.from(await encrypted.arrayBuffer());
    expect(plainBytes.subarray(0, 16).toString("ascii")).toBe("SQLite format 3\0");
    expect(isEncryptedBackup(encryptedBytes)).toBe(true);
    const decrypted = await decodeBackup(
      encryptedBytes,
      "correct horse battery staple",
    );
    expect(decrypted.subarray(0, 16).toString("ascii")).toBe("SQLite format 3\0");
  });

  test("validates a restore upload before replacing the database", async () => {
    const { databasePath, runtime } = setup();
    const cookie = await authorize(runtime);
    const handler = createAdminBackupHandler({ databasePath, runtime });
    const response = await handler.restore(
      restoreRequest({
        bytes: Buffer.from("not sqlite"),
        cookie,
        filename: "invalid.sqlite",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The selected file is not a Forman backup",
    });
    expect(validateBackupCandidate(databasePath)).toBeTruthy();
  });

  test.each([false, true])("exports and restores all configuration and data (encrypted: %s)", async (encrypted) => {
    const source = setup();
    const sourceCookie = await authorize(source.runtime);
    const now = new Date("2026-08-21T07:00:00.000Z");
    await source.runtime.current().db.insert(sources).values({
      createdAt: now,
      sourceId: "restored-form",
      type: "session",
      id: "restored-form-id",
      name: "Restored form",
      updatedAt: now,
    });
    const sourceDb = source.runtime.current().db;
    await updateGlobalSettings(sourceDb, { robotsTxt: "User-agent: *", clientBurstLimit: 9 });
    await saveSmtpSettings(sourceDb, {
      from: "sender@example.test", fromName: "Telag", host: "smtp.example.test",
      port: 465, encryption: "tls", username: "sender", password: "saved-smtp-secret",
    });
    mutateSourceConfiguration(sourceDb, "restored-form-id", () => ({
      allowedOrigins: ["https://example.test"], maxEntries: 75,
      session: { inactivityDays: 14, completedRetentionDays: 60 },
    }));
    await sourceDb.insert(submissions).values({
      id: "response", sourceId: "restored-form-id", payloadJson: '{"name":"Žluťoučký"}', createdAt: now,
    });
    await sourceDb.insert(sourceSessions).values({
      id: "draft", sourceId: "restored-form-id", keyHash: "session-key-hash",
      payloadJson: '{"note":"draft answer"}', createdAt: now, updatedAt: now, expiresAt: new Date("2030-01-01"),
    });
    await sourceDb.insert(pipelines).values({
      id: "pipeline", sourceId: "restored-form-id", name: "Processing", enabled: true, createdAt: now, updatedAt: now,
    });
    await sourceDb.insert(pages).values({
      id: "page", pageId: "public-page", sourceId: "restored-form-id", name: "Form", createdAt: now, updatedAt: now,
    });
    await sourceDb.insert(tags).values({ id: "tag", name: "Important", color: "violet", createdAt: now, updatedAt: now });
    await sourceDb.insert(sourceTags).values({ tagId: "tag", sourceId: "restored-form-id" });
    const expectedSettings = getGlobalSettings(sourceDb);
    const expectedSource = sourceById(sourceDb, "restored-form-id");
    const copiedTables = ["submission", "source_session", "page", "tag", "source_tag"];
    const expectedRows = copiedTables.map(table => source.runtime.current().client.prepare("SELECT * FROM " + table).all());
    const password = encrypted ? "correct horse battery staple" : undefined;
    const sourceHandler = createAdminBackupHandler({
      databasePath: source.databasePath,
      runtime: source.runtime,
    });
    const exported = await sourceHandler.export(
      new Request("https://forman.test/export", {
        body: JSON.stringify({ password }),
        headers: { cookie: sourceCookie, "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(exported.status).toBe(200);
    const bytes = Buffer.from(await exported.arrayBuffer());
    expect(isEncryptedBackup(bytes)).toBe(encrypted);
    const target = setup();
    const targetCookie = await authorize(target.runtime);
    await target.runtime.current().db.update(administrators).set({ username: "target-admin", passwordHash: "target-password-hash" });
    const targetAdministrator = await target.runtime.current().db.select().from(administrators);
    await target.runtime.current().db.insert(sources).values({
      createdAt: now,
      sourceId: "replaced-form",
      id: "replaced-form-id",
      name: "Replaced form",
      updatedAt: now,
    });
    const targetHandler = createAdminBackupHandler({
      databasePath: target.databasePath,
      runtime: target.runtime,
    });
    const originalTargetRows = target.runtime.current().client.prepare("SELECT * FROM source").all();
    if (encrypted) {
      for (const suppliedPassword of [undefined, "wrong-password"]) {
        const rejected = await targetHandler.restore(restoreRequest({ bytes, cookie: targetCookie, filename: "backup.forman-backup", password: suppliedPassword }));
        expect(rejected.status).toBe(400);
        expect(target.runtime.current().client.prepare("SELECT * FROM source").all()).toEqual(originalTargetRows);
      }
      const damaged = Buffer.from(bytes);
      damaged[damaged.length - 1] ^= 1;
      const rejected = await targetHandler.restore(restoreRequest({ bytes: damaged, cookie: targetCookie, filename: "backup.forman-backup", password }));
      expect(rejected.status).toBe(400);
      expect(target.runtime.current().client.prepare("SELECT * FROM source").all()).toEqual(originalTargetRows);
    }
    if (!encrypted) {
      // A recognizable SQLite header must not make a truncated upload acceptable.
      const rejected = await targetHandler.restore(restoreRequest({
        bytes: bytes.subarray(0, 100), cookie: targetCookie, filename: "truncated.sqlite",
      }));
      expect(rejected.status).toBe(400);
      expect(target.runtime.current().client.prepare("SELECT * FROM source").all()).toEqual(originalTargetRows);
      expect(await target.runtime.current().db.select().from(administrators)).toEqual(targetAdministrator);
      expect(validateBackupCandidate(target.databasePath)).toBeTruthy();
    }
    const response = await targetHandler.restore(
      restoreRequest({
        bytes,
        cookie: targetCookie,
        filename: encrypted ? "backup.forman-backup" : "backup.sqlite",
        password,
      }),
    );

    expect(response.status).toBe(204);
    const restoredDb = target.runtime.current().db;
    expect(getGlobalSettings(restoredDb)).toEqual(expectedSettings);
    expect(sourceById(restoredDb, "restored-form-id")).toEqual(expectedSource);
    expect(copiedTables.map(table => target.runtime.current().client.prepare("SELECT * FROM " + table).all())).toEqual(expectedRows);
    expect(target.runtime.current().client.pragma("foreign_key_check")).toEqual([]);
    expect(await restoredDb.select().from(administratorSessions)).toEqual([]);
    expect(await restoredDb.select().from(pipelines)).toEqual([expect.objectContaining({ id: "pipeline", enabled: false })]);
    expect(runMigrations(restoredDb)).toEqual({ initialized: false, applied: 0 });
    expect(
      (await target.runtime.current().db.select().from(sources)).map(
        (item) => item.sourceId,
      ),
    ).toEqual(["restored-form"]);
    expect(await target.runtime.current().db.select().from(administrators)).toEqual(targetAdministrator);
  });
});
