import { afterEach, describe, expect, test } from "vitest";

import { createLogoutHandler } from "@/server/auth/logout-handler";
import { createSession, getSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("administrator logout handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("revokes the current opaque session and clears its browser cookie", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);

    const response = await createLogoutHandler({ database: database.db, secure: true })(
      new Request("https://forman.example.test/api/admin/v1/auth/logout", {
        method: "POST",
        headers: { cookie: `__Host-forman_session=${token}` },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("__Host-forman_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(getSession(database.db, token)).resolves.toBeNull();
  });
});
