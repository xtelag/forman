import { afterEach, expect, test, vi } from "vitest";
import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { GET } from "@/app/health/route";

vi.mock("@/server/db/runtime", () => ({ getRuntimeDatabase: vi.fn() }));
const databases: ReturnType<typeof createDatabase>[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  vi.resetAllMocks();
});

function database() {
  const value = createDatabase(":memory:");
  databases.push(value);
  vi.mocked(getRuntimeDatabase).mockReturnValue(value);
  return value;
}

test("reports ready only after the application database is initialized", async () => {
  const value = database();
  runMigrations(value.db);
  expect(GET().status).toBe(503);
  value.client.prepare("INSERT INTO global_setting (id, updated_at) VALUES (?, ?)").run("global", Date.now());
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("returns unavailable without exposing database errors", async () => {
  database();
  const response = GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
