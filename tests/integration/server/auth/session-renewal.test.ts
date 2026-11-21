import { afterEach, expect, test, vi } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { runMigrations } from "@/server/db/migrate";
import { createSession } from "@/server/auth/sessions";
import { updateGlobalSettings } from "@/server/config/global-settings";
const runtime = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/server/db/runtime", () => ({ getRuntimeDatabase: runtime.get }));
import { POST } from "@/app/api/admin/v1/auth/session/route";
afterEach(() => vi.useRealTimers());
test("renewal updates cookie from database policy without resetting absolute age", async () => {
  const db = createTestDatabase();
  runMigrations(db.db);
  runtime.get.mockReturnValue(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00Z"));
  try {
    const token = await createSession(
      db.db,
      new Date(Date.now() - 2 * 86400_000),
    );
    await updateGlobalSettings(db.db, {
      adminSessionIdleDays: 3,
      adminSessionAbsoluteDays: 10,
    });
    const request = () =>
      new Request("https://forman.test/api/admin/v1/auth/session", {
        method: "POST",
        headers: { cookie: "__Host-forman_session=" + token },
      });
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=691200");
    await updateGlobalSettings(db.db, {
      adminSessionIdleDays: 1,
      adminSessionAbsoluteDays: 1,
    });
    const expired = await POST(request());
    expect(expired.status).toBe(401);
    expect(expired.headers.get("set-cookie")).toBeNull();
  } finally {
    db.dispose();
  }
});
