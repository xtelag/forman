import { afterEach, describe, expect, test } from "vitest";

import { createSession } from "@/server/auth/sessions";
import { runMigrations } from "@/server/db/migrate";
import { createSource } from "@/server/sources/source-service";
import { issueServerSubmissionToken } from "@/server/sources/server-token-service";
import { createAdminTestSubmissionHandler } from "@/server/sources/admin-test-submission-handler";
import { createTestDatabase } from "../../../helpers/database";

describe("admin test submission handler", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("keeps the server token private while submitting authenticated JSON", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const form = await createSource(database.db, { name: "Server intake", type: "m2m" });
    await issueServerSubmissionToken(database.db, form.id);
    const handler = createAdminTestSubmissionHandler({ database: database.db });
    const session = await createSession(database.db);

    const response = await handler.submit(new Request("https://forman.example.test", {
      body: JSON.stringify({ email: "john@example.test", name: "John" }),
      headers: { cookie: `__Host-forman_session=${session}`, "content-type": "application/json" },
      method: "POST",
    }), form.sourceId);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ success: true, submissionId: expect.any(String) });
    expect(database.client.prepare("select payload_json from submission").get()).toEqual({ payload_json: '{"email":"john@example.test","name":"John"}' });
  });
});
