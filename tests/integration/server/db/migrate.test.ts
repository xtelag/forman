import { afterEach, describe, expect, test } from "vitest";

import { getGlobalSettings } from "@/server/config/global-settings";
import { runMigrations } from "@/server/db/migrate";
import { createUnmigratedTestDatabase } from "../../../helpers/database";

describe("runMigrations", () => {
  const databases: ReturnType<typeof createUnmigratedTestDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.dispose();
    }
  });

  test("creates the complete durable Pipeline model from one initialization migration", () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);

    expect(runMigrations(database.db)).toEqual({ initialized: true, applied: 1 });
    expect(
      database.client
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all(),
    ).toEqual(expect.arrayContaining([
      { name: "administrator" },
      { name: "administrator_session" },
      { name: "consumed_challenge" },
      { name: "email_confirmation_session" },
      { name: "email_confirmation_session_action" },
      { name: "pipeline_run" },
      { name: "pipeline" },
      { name: "pipeline_action" },
      { name: "pipeline_action_run" },
      { name: "global_setting" },
      { name: "inbox_item" },
      { name: "page" },
      { name: "server_submission_token" },
      { name: "source" },
      { name: "source_tag" },
      { name: "submission" },
      { name: "tag" },
    ]));
    expect(
      database.client.prepare("pragma table_info('consumed_challenge')").all(),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: "source_id" })]));
    for (const [table, columns] of Object.entries({
      pipeline_run: ["pipeline_id", "pipeline_name", "snapshot_json"],
      pipeline_action_run: ["run_id", "action_type", "input_payload_json", "callback_token"],
      email_confirmation_session: ["source_id", "pipeline_id", "recipient_fingerprint", "capability_hash", "owner_action_run_id", "status", "expires_at"],
      email_confirmation_session_action: ["session_id", "action_run_id"],
      inbox_item: ["pipeline_action_run_id", "action_name", "state"],
      page: ["page_id", "source_id", "presentation_json"],
      source_tag: ["source_id", "tag_id"],
    })) {
      const names = database.client
        .prepare(`pragma table_info('${table}')`)
        .all()
        .map((column) => (column as { name: string }).name);
      expect(names).toEqual(expect.arrayContaining(columns));
    }
    const plan = database.client.prepare("explain query plan select id from pipeline_run where source_id = ? order by created_at desc, id desc limit 25").all("source-1") as { detail: string }[];
    expect(plan.some((step) => step.detail.includes("pipeline_run_source_created_id_idx"))).toBe(true);
    expect(plan.some((step) => step.detail.includes("TEMP B-TREE"))).toBe(false);
    expect(runMigrations(database.db)).toEqual({ initialized: false, applied: 0 });
  });

  test("initializes validated JSON defaults without individual setting columns", () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    expect(getGlobalSettings(database.db)).toMatchObject({
      smtpEncryption: "tls", adminSessionIdleDays: 7, adminSessionAbsoluteDays: 30,
      smtpFromName: null, smtpAuthentication: true,
    });
    const columns = database.client.prepare("pragma table_info(global_setting)").all() as { name: string }[];
    expect(columns.map(column => column.name)).toEqual([
      "id", "configuration_json", "admin_password_reset_fingerprint", "updated_at",
    ]);
    expect(() => database.client.exec("UPDATE global_setting SET configuration_json = '[]'")).toThrow();
    expect(() => database.client.exec("UPDATE global_setting SET configuration_json = 'invalid'")).toThrow();
  });

  test("refuses an unrecognized database without adding baseline tables", () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    database.client.exec("create table source (id text primary key); insert into source values ('preserve');");

    expect(() => runMigrations(database.db)).toThrow(
      "This database does not match the current Forman baseline",
    );
    expect(database.client.prepare("select id from source").all()).toEqual([{ id: "preserve" }]);
    expect(
      database.client.prepare("select name from sqlite_master where type = 'table' and name = 'form'").all(),
    ).toEqual([]);
  });

  test("leaves a near-current but incompatible database unchanged", () => {
    const database = createUnmigratedTestDatabase();
    databases.push(database);
    runMigrations(database.db);
    database.client.exec(`
      delete from __drizzle_migrations;
      insert into __drizzle_migrations (hash, created_at)
        values ('pre-baseline-history', 1);
      alter table consumed_challenge rename column source_id to form_id;
      alter table source add column unsupported_column text;
    `);

    expect(() => runMigrations(database.db)).toThrow(
      "This database does not match the current Forman baseline",
    );
    expect(
      database.client.prepare("pragma table_info('consumed_challenge')").all(),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: "form_id" })]));
    expect(
      database.client.prepare("pragma table_info('source')").all(),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: "unsupported_column" })]));
    expect(
      database.client.prepare("select hash, created_at from __drizzle_migrations").all(),
    ).toEqual([{ created_at: 1, hash: "pre-baseline-history" }]);
  });
});
