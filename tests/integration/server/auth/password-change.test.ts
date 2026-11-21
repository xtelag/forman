import { afterEach, describe, expect, test } from "vitest";

import { changeAdministratorPassword } from "@/server/auth/password-change";
import { createSession, getSession } from "@/server/auth/sessions";
import { verifyPassword } from "@/server/auth/passwords";
import { loadEnvironment } from "@/server/config/environment";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { createTestDatabase } from "../../../helpers/database";

const environment = loadEnvironment({
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("changeAdministratorPassword", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("changes a valid password, clears the initial warning, and ends existing sessions", async () => {
    const database = createTestDatabase();
    databases.push(database);
    await createStartupBootstrap({ database: database.db, environment, write: () => undefined }).start();
    const token = await createSession(database.db);
    const nextPassword = "twenty characters are enough!";

    await expect(changeAdministratorPassword(database.db, "change-me", nextPassword)).resolves.toBe(true);
    const record = database.client.prepare("select password_hash, is_initial_password from administrator where id = 'admin'").get() as { password_hash: string; is_initial_password: number };
    await expect(verifyPassword(nextPassword, record.password_hash)).resolves.toBe(true);
    expect(record.is_initial_password).toBe(0);
    await expect(getSession(database.db, token)).resolves.toBeNull();
  });

  test("rejects an incorrect current password and passwords shorter than 20 characters", async () => {
    const database = createTestDatabase();
    databases.push(database);
    await createStartupBootstrap({ database: database.db, environment, write: () => undefined }).start();

    await expect(changeAdministratorPassword(database.db, "wrong", "twenty characters are enough!")).resolves.toBe(false);
    await expect(changeAdministratorPassword(database.db, "change-me", "short")).resolves.toBe(false);
  });
});
