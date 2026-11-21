import { defineConfig } from "@playwright/test";

const authEnvironment = {
  FORMAN_ALTCHA_SECRET: "forman-auth-e2e-altcha-secret-that-is-at-least-thirty-two-chars",
  FORMAN_BASE_ORIGIN: "http://localhost:3101",
  FORMAN_DATABASE_PATH: "/tmp/forman-auth-e2e.sqlite",
  FORMAN_INITIAL_ADMIN_PASSWORD: "forman-e2e-password-2026",
  FORMAN_NEXT_DIST_DIR: ".runtime/auth-e2e-next",
  FORMAN_SESSION_SECRET: "forman-auth-e2e-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_TRUST_PROXY: "true",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "admin-auth.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    extraHTTPHeaders: { "x-forwarded-for": "127.0.0.1" },
    trace: "on-first-retry",
  },
  webServer: {
    timeout: 180_000,
    command: "rm -rf .runtime/auth-e2e-next /tmp/forman-auth-e2e.sqlite && node_modules/.bin/next build --webpack && node_modules/.bin/next start --hostname 127.0.0.1 --port 3101",
    env: authEnvironment,
    reuseExistingServer: false,
    url: "http://localhost:3101/login",
  },
  workers: 1,
});
