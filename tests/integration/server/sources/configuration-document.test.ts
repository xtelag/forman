import { expect, test } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { createDatabase } from "@/server/db/client";
import { createSource } from "@/server/sources/source-service";
import { sourceById, mutateSourceConfiguration } from "@/server/sources/source-configuration-document";
import { updateSourceConfiguration } from "@/server/sources/lifecycle-service";
import { validateBackupCandidate } from "@/server/backup/sqlite-backup";

test("independent section updates retain Source options and session settings", async () => {
  const first = createTestDatabase();
  const second = createDatabase(first.client.name);
  try {
    const source = await createSource(first.db, { name: "Survey", type: "session" });
    mutateSourceConfiguration(second.db, source.id, () => ({
      session: { inactivityDays: 14, completedRetentionDays: 60 },
    }));
    expect(await updateSourceConfiguration(first.db, source.id, {
      name: "Renamed survey", successUrl: "https://example.test/thanks",
    }, true)).toBe("saved");
    expect(await updateSourceConfiguration(second.db, source.id, {
      maxEntries: 75, retentionDays: 90, sessionInactivityDays: 21,
    }, true)).toBe("saved");
    expect(sourceById(first.db, source.id)).toMatchObject({
      name: "Renamed survey", successUrl: "https://example.test/thanks",
      maxEntries: 75, retentionDays: 90,
      session: { inactivityDays: 21, completedRetentionDays: 60 },
    });
    const before = sourceById(first.db, source.id);
    expect(await updateSourceConfiguration(second.db, source.id, {
      name: "Must not persist", sessionInactivityDays: 0,
    }, true)).toBe("invalid");
    expect(sourceById(first.db, source.id)).toEqual(before);
  } finally { second.close(); first.dispose(); }
});

test("missing options use defaults and invalid JSON options reject both reads and restore", async () => {
  const database = createTestDatabase();
  try {
    const source = await createSource(database.db, { name: "Form", type: "one-shot" });
    database.client.prepare("UPDATE source SET configuration_json = ? WHERE id = ?")
      .run(JSON.stringify({ allowedOrigins: ["https://example.test"] }), source.id);
    expect(sourceById(database.db, source.id)).toMatchObject({
      allowedOrigins: ["https://example.test"], maxEntries: 50,
      session: { inactivityDays: 30, completedRetentionDays: 30 },
    });
    database.client.prepare("UPDATE source SET configuration_json = ? WHERE id = ?")
      .run(JSON.stringify({ maxEntries: 0 }), source.id);
    expect(() => sourceById(database.db, source.id)).toThrow();
    expect(() => validateBackupCandidate(database.client.name)).toThrow("The selected file is not a Forman backup");
  } finally { database.dispose(); }
});
