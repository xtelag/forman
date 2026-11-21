import { afterEach, describe, expect, test } from "vitest";

import { createPasswordChangeHandler } from "@/server/auth/password-change-handler";
import { createSession } from "@/server/auth/sessions";
import { loadEnvironment } from "@/server/config/environment";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { createTestDatabase } from "../../../helpers/database";

const environment = loadEnvironment({
  NODE_ENV: "test",
  FORMAN_BASE_ORIGIN: "https://forman.example.test", FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true", FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars", FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("password change handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("requires a session, changes the password, and clears the browser cookie", async () => {
    const database = createTestDatabase(); databases.push(database);
    await createStartupBootstrap({ database: database.db, environment, write: () => undefined }).start();
    const token = await createSession(database.db);
    const body = new URLSearchParams({ confirmPassword: "twenty characters are enough!", currentPassword: "change-me", nextPassword: "twenty characters are enough!" });

    const response = await createPasswordChangeHandler({ database: database.db, secure: true })(new Request("https://forman.example.test/api/admin/v1/account/password", {
      method: "POST", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/x-www-form-urlencoded" }, body,
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?password=changed");
    expect(response.headers.get("set-cookie")).toContain("__Host-forman_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("rejects a password confirmation that does not match", async () => {
    const database = createTestDatabase(); databases.push(database);
    await createStartupBootstrap({ database: database.db, environment, write: () => undefined }).start();
    const token = await createSession(database.db);
    const body = new URLSearchParams({ confirmPassword: "a different password that is long enough", currentPassword: "change-me", nextPassword: "twenty characters are enough!" });

    const response = await createPasswordChangeHandler({ database: database.db, secure: true })(new Request("https://forman.example.test/api/admin/v1/account/password", {
      method: "POST", headers: { cookie: `__Host-forman_session=${token}`, "content-type": "application/x-www-form-urlencoded" }, body,
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/app/settings?error=password");
  });
});
