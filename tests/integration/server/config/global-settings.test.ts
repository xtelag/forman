import { afterEach, describe, expect, test } from "vitest";

import {
  getGlobalSettings,
  updateGlobalSettings,
} from "@/server/config/global-settings";
import { saveSmtpSettings, getCompleteSmtpSettings } from "@/server/config/smtp-settings";
import { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("global settings", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("returns defaults and persists updates for subsequent reads", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    expect((await getGlobalSettings(database.db)).loginFailureLimit).toBe(5);
    expect(
      (await getGlobalSettings(database.db)).submissionRateLimitPerMinute,
    ).toBe(5);
    expect(
      (await getGlobalSettings(database.db)).clientRateLimitPerMinute,
    ).toBe(20);
    expect(
      (await getGlobalSettings(database.db)).sourceRateLimitPerMinute,
    ).toBe(100);
    expect((await getGlobalSettings(database.db)).clientBurstLimit).toBe(3);
    expect(
      (await getGlobalSettings(database.db))
        .formspreeCompatibilityEndpointEnabled,
    ).toBe(false);
    expect((await getGlobalSettings(database.db)).robotsTxt).toBe(
      "User-agent: *\nDisallow: /\n",
    );

    await updateGlobalSettings(database.db, {
      formspreeCompatibilityEndpointEnabled: true,
      robotsTxt: "User-agent: *\nAllow: /sources/\n",
      submissionRateLimitPerMinute: 12,
    });
    expect(
      (await getGlobalSettings(database.db))
        .formspreeCompatibilityEndpointEnabled,
    ).toBe(true);
    expect((await getGlobalSettings(database.db)).robotsTxt).toBe(
      "User-agent: *\nAllow: /sources/\n",
    );
    expect(
      (await getGlobalSettings(database.db)).submissionRateLimitPerMinute,
    ).toBe(12);
  });

  test("rejects invalid protection settings without replacing active values", async () => {
    const database = createTestDatabase();
    databases.push(database);
    runMigrations(database.db);

    await expect(
      updateGlobalSettings(database.db, { submissionRateLimitPerMinute: 0 }),
    ).resolves.toBe(false);
    expect(
      (await getGlobalSettings(database.db)).submissionRateLimitPerMinute,
    ).toBe(5);
  });
});

test("stores session limits and validates partial updates against saved values", async () => {
  const database = createTestDatabase();
  runMigrations(database.db);
  try {
    expect(await getGlobalSettings(database.db)).toMatchObject({
      adminSessionIdleDays: 7,
      adminSessionAbsoluteDays: 30,
    });
    expect(
      await updateGlobalSettings(database.db, {
        adminSessionIdleDays: 14,
        adminSessionAbsoluteDays: 60,
      }),
    ).toBe(true);
    expect(
      await updateGlobalSettings(database.db, { adminSessionAbsoluteDays: 10 }),
    ).toBe(false);
    expect(
      await updateGlobalSettings(database.db, { adminSessionIdleDays: 0 }),
    ).toBe(false);
    expect(await getGlobalSettings(database.db)).toMatchObject({
      adminSessionIdleDays: 14,
      adminSessionAbsoluteDays: 60,
    });
  } finally {
    database.dispose();
  }
});

test("independent writers preserve other sections and saved SMTP secrets", async () => {
  const first = createTestDatabase();
  const second = createDatabase(first.client.name);
  try {
    await saveSmtpSettings(first.db, {
      from: "sender@example.test", fromName: "Telag", host: "smtp.example.test",
      port: 465, encryption: "tls", username: "sender", password: "saved-password",
    });
    await updateGlobalSettings(first.db, { adminSessionIdleDays: 10 });
    await updateGlobalSettings(second.db, { robotsTxt: "User-agent: *" });
    await updateGlobalSettings(first.db, { clientBurstLimit: 9 });
    expect(getGlobalSettings(second.db)).toMatchObject({
      adminSessionIdleDays: 10, robotsTxt: "User-agent: *", clientBurstLimit: 9,
      smtpFromName: "Telag", smtpPassword: "saved-password",
    });
    expect((await getCompleteSmtpSettings(second.db))?.password).toBe("saved-password");
    const before = getGlobalSettings(first.db);
    expect(await updateGlobalSettings(second.db, { smtpPassword: "injected" })).toBe(false);
    expect(await updateGlobalSettings(second.db, { unknownSetting: true })).toBe(false);
    expect(getGlobalSettings(first.db)).toEqual(before);
  } finally { second.close(); first.dispose(); }
});

test("JSON defaults fill missing fields but invalid stored settings fail explicitly", () => {
  const database = createTestDatabase();
  try {
    getGlobalSettings(database.db);
    database.client.prepare("UPDATE global_setting SET configuration_json = ?")
      .run(JSON.stringify({ robotsTxt: "custom", adminSessionIdleDays: 14 }));
    expect(getGlobalSettings(database.db)).toMatchObject({
      robotsTxt: "custom", adminSessionIdleDays: 14, adminSessionAbsoluteDays: 30,
      smtpFromName: null, smtpAuthentication: true,
    });
    database.client.prepare("UPDATE global_setting SET configuration_json = ?")
      .run(JSON.stringify({ adminSessionIdleDays: 0 }));
    expect(() => getGlobalSettings(database.db)).toThrow();
  } finally { database.dispose(); }
});
