import { afterEach, describe, expect, test, vi } from "vitest";

import { loadEnvironment } from "@/server/config/environment";
import { createTestDatabase } from "../../../helpers/database";

const { runMigrations } = vi.hoisted(() => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/server/db/migrate", () => ({ runMigrations }));

import { createStartupBootstrap } from "@/server/startup/bootstrap";

const environment = loadEnvironment({
  FORMAN_BASE_ORIGIN: "https://forman.example.test",
  FORMAN_DATABASE_PATH: "/data/forman.sqlite",
  FORMAN_TRUST_PROXY: "true",
  FORMAN_SESSION_SECRET: "a-session-secret-that-is-at-least-thirty-two-chars",
  FORMAN_ALTCHA_SECRET: "an-altcha-secret-that-is-at-least-thirty-two-chars",
  NODE_ENV: "test",
  FORMAN_INITIAL_ADMIN_PASSWORD: "change-me",
});

describe("startup migration status", () => {
  const databases: Array<ReturnType<typeof createTestDatabase>> = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const database of databases.splice(0)) database.dispose();
  });

  test.each([
    [{ initialized: false, applied: 0 }, "✓ Database schema ready (no migrations applied)"],
    [{ initialized: true, applied: 1 }, "✓ New database initialized"],
    [{ initialized: false, applied: 1 }, "✓ Database schema updated (1 migration applied)"],
    [{ initialized: false, applied: 2 }, "✓ Database schema updated (2 migrations applied)"],
  ])("reports the result for %j", async (count, message) => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations.mockReturnValue(count);
    const output: string[] = [];

    await createStartupBootstrap({
      database: database.db,
      environment,
      write: (value) => output.push(value),
    }).start();

    expect(output.slice(1)).toEqual([
      "→ Checking database migrations",
      message,
      "→ Base origin: https://forman.example.test",
    ]);
  });
});
