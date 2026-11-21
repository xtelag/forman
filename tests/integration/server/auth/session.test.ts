import { afterEach, describe, expect, test, vi } from "vitest";

import {
  administratorSessionCookieName,
  createSession,
  deleteSession,
  getSession,
  serializeAdministratorSessionCookie,
} from "@/server/auth/sessions";
import { updateGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("administrator sessions", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("stores only an opaque token digest and supports logout", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    const token = await createSession(database.db);
    const stored = database.client
      .prepare("select token_hash from administrator_session limit 1")
      .get() as { token_hash: string };

    expect(stored.token_hash).not.toBe(token);
    await expect(getSession(database.db, token)).resolves.toMatchObject({
      id: expect.any(String),
    });

    await deleteSession(database.db, token);
    await expect(getSession(database.db, token)).resolves.toBeNull();
  });

  test("expires an idle session at seven days and deletes its row", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const created = new Date("2026-08-23T08:00:00.000Z");
    const token = await createSession(database.db, created);

    await expect(
      getSession(
        database.db,
        token,
        new Date(created.getTime() + 7 * 86400_000),
      ),
    ).resolves.toBeNull();
    expect(
      database.client
        .prepare("select count(*) as count from administrator_session")
        .get(),
    ).toEqual({ count: 0 });
  });

  test("expires a refreshed session at the thirty-day absolute boundary", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const created = new Date("2026-08-23T08:00:00.000Z");
    const token = await createSession(database.db, created);
    for (let minutes = 1440; minutes < 30 * 1440; minutes += 1440) {
      await expect(
        getSession(
          database.db,
          token,
          new Date(created.getTime() + minutes * 60_000),
          { touch: true },
        ),
      ).resolves.not.toBeNull();
    }
    await expect(
      getSession(
        database.db,
        token,
        new Date(created.getTime() + 30 * 86400_000),
      ),
    ).resolves.toBeNull();
  });

  test("serializes host-only HTTPS cookies and local HTTP cookies", () => {
    expect(administratorSessionCookieName(true)).toBe("__Host-forman_session");
    expect(
      serializeAdministratorSessionCookie({ secure: true, token: "opaque" }),
    ).toBe(
      "__Host-forman_session=opaque; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure",
    );
    expect(
      serializeAdministratorSessionCookie({
        clear: true,
        secure: false,
        token: "",
      }),
    ).toBe("forman_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  });
});

test("background validation does not extend inactivity, but explicit activity does", async () => {
  const db = createTestDatabase();
  runMigrations(db.db);
  try {
    const start = new Date("2026-09-01T00:00Z");
    const token = await createSession(db.db, start);
    await expect(
      getSession(db.db, token, new Date(+start + 6 * 86400_000)),
    ).resolves.not.toBeNull();
    await expect(
      getSession(db.db, token, new Date(+start + 7 * 86400_000)),
    ).resolves.toBeNull();
    const active = await createSession(db.db, start);
    await getSession(db.db, active, new Date(+start + 6 * 86400_000), {
      touch: true,
    });
    await expect(
      getSession(db.db, active, new Date(+start + 8 * 86400_000)),
    ).resolves.not.toBeNull();
  } finally {
    db.dispose();
  }
});
test("honors configurable administrator inactivity", async () => {
  const db = createTestDatabase();
  runMigrations(db.db);
  await updateGlobalSettings(db.db, { adminSessionIdleDays: 2 });
  try {
    const start = new Date("2026-09-01T00:00Z");
    const token = await createSession(db.db, start);
    await expect(
      getSession(db.db, token, new Date(+start + 2 * 86400_000)),
    ).resolves.toBeNull();
  } finally {
    db.dispose();
    vi.unstubAllEnvs();
  }
});
