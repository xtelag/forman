import { describe, expect, test } from "vitest";

import {
  assertSafeInitialAdminPassword,
  loadEnvironment,
} from "@/server/config/environment";

const validEnvironment = {
  NODE_ENV: "test",
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
};

describe("loadEnvironment", () => {
  test("returns typed deployment settings", () => {
    const environment = loadEnvironment(validEnvironment);
    expect(environment).toMatchObject({
      baseOrigin: new URL("https://forman.example.test"),
      databasePath: "/data/forman.sqlite",
      trustProxy: true,
      initialAdminPassword: "change-me",
    });
  });

  test("does not trust forwarding headers unless explicitly configured", () => {
    const direct: Record<string, string | undefined> = { ...validEnvironment };
    direct.FORMAN_TRUST_PROXY = undefined;
    expect(loadEnvironment(direct).trustProxy).toBe(false);
  });

  test("does not expose SMTP credentials from deployment settings", () => {
    expect(loadEnvironment({ ...validEnvironment, FORMAN_SMTP_FROM: "forman@example.test", FORMAN_SMTP_HOST: "smtp.example.test", FORMAN_SMTP_PASSWORD: "password", FORMAN_SMTP_PORT: "587", FORMAN_SMTP_SECURE: "false", FORMAN_SMTP_USERNAME: "forman" })).not.toHaveProperty("smtp");
  });

  test.each([
    "http://localhost:5173",
    "http://forman.localhost:5173",
    "http://preview.forman.localhost:5173",
    "http://FORMAN.LOCALHOST:5173",
  ])("allows local HTTP origin %s", (origin) => {
    expect(loadEnvironment({ ...validEnvironment, FORMAN_BASE_ORIGIN: origin }).baseOrigin)
      .toEqual(new URL(origin));
  });

  test.each([
    "http://example.test",
    "http://notlocalhost:5173",
    "http://forman.localhost.example.test",
    "http://localhost@example.test",
    "ftp://localhost",
    "ftp://forman.localhost",
  ])("rejects unsafe base origin %s", (origin) => {
    expect(() => loadEnvironment({ ...validEnvironment, FORMAN_BASE_ORIGIN: origin }))
      .toThrow(/FORMAN_BASE_ORIGIN/);
  });

  test("rejects invalid public base URLs", () => {
    expect(() =>
      loadEnvironment({ ...validEnvironment, FORMAN_BASE_ORIGIN: "not-a-url" }),
    ).toThrow(/FORMAN_BASE_ORIGIN/);
  });

  test("rejects short secrets and unsafe emergency passwords", () => {
    expect(() =>
      loadEnvironment({ ...validEnvironment, FORMAN_SESSION_SECRET: "too-short" }),
    ).toThrow(/FORMAN_SESSION_SECRET/);
    expect(() =>
      loadEnvironment({ ...validEnvironment, FORMAN_ADMIN_PASSWORD_RESET: "short" }),
    ).toThrow(/FORMAN_ADMIN_PASSWORD_RESET/);
  });

  test("separates build-time parsing from the production startup password policy", () => {
    const production = { ...validEnvironment, NODE_ENV: "production" };
    const expected = /FORMAN_INITIAL_ADMIN_PASSWORD must contain at least 20 characters and must not use the default value in production/;

    const withoutPassword: Record<string, string | undefined> = { ...production };
    withoutPassword.FORMAN_INITIAL_ADMIN_PASSWORD = undefined;
    expect(() => assertSafeInitialAdminPassword(loadEnvironment(withoutPassword))).toThrow(expected);
    expect(() => assertSafeInitialAdminPassword(loadEnvironment({
      ...production,
      FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
    }))).toThrow(expected);
    expect(() => assertSafeInitialAdminPassword(loadEnvironment({
      ...production,
      FORMAN_INITIAL_ADMIN_PASSWORD: "nineteen-character!",
    }))).toThrow(expected);
    const safe = loadEnvironment({
      ...production,
      FORMAN_INITIAL_ADMIN_PASSWORD: "twenty-characters-ok!",
    });
    expect(() => assertSafeInitialAdminPassword(safe)).not.toThrow();
    expect(safe.runtimeMode).toBe("production");
  });
});
