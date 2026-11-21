import { defineConfig, devices } from "@playwright/test";

const e2eEnvironment = {
  FORMAN_ALTCHA_SECRET: "forman-e2e-altcha-secret-that-is-at-least-thirty-two-chars",
  FORMAN_BASE_ORIGIN: "http://localhost:3100",
  FORMAN_DATABASE_PATH: "/tmp/forman-e2e.sqlite",
  FORMAN_E2E_FLASH_HOOK_URL: "https://127.0.0.1:3443/flash",
  FORMAN_E2E_TEST_RUNTIME: "playwright",
  FORMAN_INITIAL_ADMIN_PASSWORD: "forman-e2e-password-2026",
  FORMAN_NEXT_DIST_DIR: ".runtime/e2e-next",
  FORMAN_SESSION_SECRET: "forman-e2e-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_TRUST_PROXY: "true",
  NODE_EXTRA_CA_CERTS: "/tmp/forman-e2e-flash-hook.crt",
  NODE_ENV: "production",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "admin-auth.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    extraHTTPHeaders: { "x-forwarded-for": "127.0.0.1" },
    trace: "on-first-retry",
  },
  webServer: {
    timeout: 180_000,
    command: "rm -rf .runtime/e2e-next /tmp/forman-e2e.sqlite /tmp/forman-e2e-flash-hook.key /tmp/forman-e2e-flash-hook.crt; openssl req -x509 -newkey rsa:2048 -keyout /tmp/forman-e2e-flash-hook.key -out /tmp/forman-e2e-flash-hook.crt -days 1 -nodes -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' >/dev/null 2>&1; node tests/e2e/support/flash-hook-server.mjs /tmp/forman-e2e-flash-hook.key /tmp/forman-e2e-flash-hook.crt & flash_hook_pid=$!; trap 'kill $flash_hook_pid' EXIT INT TERM; node_modules/.bin/next build --webpack && node_modules/.bin/next start --hostname 127.0.0.1 --port 3100",
    env: e2eEnvironment,
    reuseExistingServer: false,
    url: "http://localhost:3100/login",
  },
  workers: 1,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
