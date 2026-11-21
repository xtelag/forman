import { scrypt } from "node:crypto";

import { afterEach, describe, expect, test } from "vitest";

import { createLoginHandler } from "@/server/auth/login-handler";
import { getSession } from "@/server/auth/sessions";
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

const directEnvironment = loadEnvironment({
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

async function legacyVerifier(password: string) {
  const salt = Buffer.alloc(16, 9);
  const digest = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    );
  });
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

describe("administrator login handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() =>
    databases.splice(0).forEach((database) => database.dispose()),
  );

  test("sets an opaque persistent cookie and redirects a valid admin login", async () => {
    const database = createTestDatabase();
    databases.push(database);
    await createStartupBootstrap({
      database: database.db,
      environment,
      write: () => undefined,
    }).start();
    database.client
      .prepare("update administrator set password_hash = ? where id = 'admin'")
      .run(await legacyVerifier("change-me"));
    const handler = createLoginHandler({ database: database.db, environment });
    const body = new URLSearchParams({
      username: "forman",
      password: "change-me",
    });

    const response = await handler(
      new Request("https://forman.example.test/api/admin/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.4",
        },
        body,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/app");
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("__Host-forman_session=");
    expect(cookie).toContain("; Secure");
    expect(cookie).toContain("Max-Age=2592000");
    const sessionToken = cookie?.match(/^__Host-forman_session=([^;]+)/)?.[1];
    expect(sessionToken).toBeDefined();
    await expect(getSession(database.db, sessionToken!)).resolves.toMatchObject(
      {
        id: expect.any(String),
      },
    );
    expect(
      (
        database.client
          .prepare("select password_hash from administrator where id = 'admin'")
          .get() as { password_hash: string }
      ).password_hash,
    ).toMatch(/^scrypt:v2:/);
  });

  test("returns generic login failure for an invalid credential", async () => {
    const database = createTestDatabase();
    databases.push(database);
    await createStartupBootstrap({
      database: database.db,
      environment,
      write: () => undefined,
    }).start();
    const handler = createLoginHandler({ database: database.db, environment });
    const body = new URLSearchParams({
      username: "admin",
      password: "not-the-password",
    });

    const response = await handler(
      new Request("https://forman.example.test/api/admin/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.4",
        },
        body,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("accepts a valid direct-deployment login without trusting forwarding headers", async () => {
    const database = createTestDatabase();
    databases.push(database);
    await createStartupBootstrap({
      database: database.db,
      environment: directEnvironment,
      write: () => undefined,
    }).start();
    const handler = createLoginHandler({
      database: database.db,
      environment: directEnvironment,
    });

    const response = await handler(
      new Request("https://forman.example.test/api/admin/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: "forman",
          password: "change-me",
        }),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/app");
    expect(response.headers.get("set-cookie")).toContain(
      "__Host-forman_session=",
    );
  });
});

test("inline login returns 401 on failure and 204 with a persistent cookie on success", async () => {
  const db = createTestDatabase();
  try {
    await createStartupBootstrap({
      database: db.db,
      environment,
      write: () => undefined,
    }).start();
    const handler = createLoginHandler({ database: db.db, environment });
    const request = (password: string) =>
      new Request("https://forman.example.test/api/admin/v1/auth/login", {
        method: "POST",
        headers: { accept: "application/json" },
        body: new URLSearchParams({ username: "forman", password }),
      });
    const invalid = await handler(request("wrong"));
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("location")).toBeNull();
    const valid = await handler(request("change-me"));
    expect(valid.status).toBe(204);
    expect(valid.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect(valid.headers.get("location")).toBeNull();
  } finally {
    db.dispose();
  }
});
