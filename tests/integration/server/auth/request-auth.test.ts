import { afterEach, describe, expect, test } from "vitest";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("administrator request authentication", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("accepts exactly the cookie name selected by transport security", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    const token = await createSession(database.db);

    await expect(
      getAdministratorSessionFromCookie(database.db, `forman_session=wrong; __Host-forman_session=${token}`, { secure: true }),
    ).resolves.toMatchObject({ id: expect.any(String) });
    await expect(getAdministratorSessionFromCookie(database.db, `__Host-forman_session=wrong; forman_session=${token}`, { secure: false })).resolves.toMatchObject({ id: expect.any(String) });
    await expect(getAdministratorSessionFromCookie(database.db, `forman_session=${token}`, { secure: true })).resolves.toBeNull();
    await expect(getAdministratorSessionFromCookie(database.db, `__Host-forman_session=${token}`, { secure: false })).resolves.toBeNull();
  });
});
