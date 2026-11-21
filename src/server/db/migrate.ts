import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { createDatabase } from "./client";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type MigrationJournal = {
  entries: Array<{ tag: string; when: number }>;
};

const migrationFolder = path.join(process.cwd(), "drizzle");
const baselineTag = "0000_forman_init";
export const currentSchemaTables = {
  "administrator": [
    "id",
    "username",
    "password_hash",
    "is_initial_password",
    "password_changed_at",
    "created_at"
  ],
  "administrator_session": [
    "id",
    "token_hash",
    "created_at",
    "last_seen_at"
  ],
  "consumed_challenge": [
    "challenge_id",
    "source_id",
    "expires_at",
    "consumed_at"
  ],
  "email_confirmation_session": [
    "id",
    "source_id",
    "pipeline_id",
    "recipient_fingerprint",
    "capability_hash",
    "owner_action_run_id",
    "status",
    "expires_at",
    "confirmed_at",
    "created_at",
    "updated_at"
  ],
  "email_confirmation_session_action": [
    "session_id",
    "action_run_id"
  ],
  "inbox_item": [
    "id",
    "pipeline_action_run_id",
    "source_id",
    "submission_id",
    "source_name",
    "action_name",
    "payload_json",
    "state",
    "pre_trash_state",
    "read_at",
    "archived_at",
    "trashed_at",
    "created_at",
    "updated_at"
  ],
  "page": [
    "id",
    "page_id",
    "name",
    "source_id",
    "enabled",
    "presentation_json",
    "created_at",
    "updated_at"
  ],
  "pipeline": [
    "id",
    "source_id",
    "name",
    "enabled",
    "created_at",
    "updated_at"
  ],
  "pipeline_action": [
    "id",
    "pipeline_id",
    "name",
    "position",
    "action_type",
    "enabled",
    "condition_json",
    "condition_miss_behavior",
    "blocking",
    "failure_policy",
    "maximum_attempts",
    "configuration_json",
    "created_at",
    "updated_at"
  ],
  "pipeline_action_run": [
    "id",
    "run_id",
    "action_id",
    "name",
    "position",
    "action_type",
    "blocking",
    "failure_policy",
    "maximum_attempts",
    "condition_json",
    "condition_miss_behavior",
    "configuration_json",
    "input_payload_json",
    "output_payload_json",
    "status",
    "attempt_count",
    "next_attempt_at",
    "callback_expires_at",
    "error_summary",
    "created_at",
    "updated_at",
    "callback_token"
  ],
  "pipeline_run": [
    "id",
    "pipeline_id",
    "submission_id",
    "source_id",
    "pipeline_name",
    "snapshot_json",
    "status",
    "created_at",
    "updated_at"
  ],
  "server_submission_token": [
    "source_id",
    "token",
    "token_prefix",
    "issued_at",
    "rotated_at"
  ],
  "source": [
    "id",
    "source_id",
    "name",
    "enabled",
    "retention_days",
    "created_at",
    "updated_at",
    "type",
    "configuration_json"
  ],
  "source_session": [
    "id",
    "source_id",
    "key_hash",
    "status",
    "payload_json",
    "revision",
    "update_count",
    "request_count",
    "submission_id",
    "created_at",
    "updated_at",
    "expires_at",
    "current_page"
  ],
  "source_session_operation": [
    "session_id",
    "operation_id",
    "request_hash"
  ],
  "source_tag": [
    "source_id",
    "tag_id"
  ],
  "submission": [
    "id",
    "source_id",
    "payload_json",
    "created_at",
    "user_agent",
    "referer",
    "client_ip",
    "session_update_count",
    "session_request_count"
  ],
  "tag": [
    "id",
    "name",
    "color",
    "created_at",
    "updated_at"
  ],
  "global_setting": [
    "id",
    "configuration_json",
    "admin_password_reset_fingerprint",
    "updated_at"
  ]
} as const;

export type MigrationBaseline = {
  hash: string;
  timestamp: number;
};

export function currentMigrationBaseline(): MigrationBaseline {
  const journal = JSON.parse(
    readFileSync(path.join(migrationFolder, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  const entry = journal.entries.find(({ tag }) => tag === baselineTag);
  if (!entry) throw new Error("The Forman baseline migration is missing");

  return {
    hash: createHash("sha256")
      .update(readFileSync(path.join(migrationFolder, `${baselineTag}.sql`), "utf8"))
      .digest("hex"),
    timestamp: entry.when,
  };
}

export function currentMigrationTimestamp() {
  const journal = JSON.parse(
    readFileSync(path.join(migrationFolder, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;
  return Math.max(...journal.entries.map(({ when }) => when));
}

function migrationCount(database: FormanDatabase) {
  const table = database.get<{ count: number }>(sql`
    select count(*) as count
    from sqlite_master
    where type = 'table' and name = '__drizzle_migrations'
  `);
  if (table.count === 0) return 0;

  return database.get<{ count: number }>(
    sql`select count(*) as count from __drizzle_migrations`,
  ).count;
}

function tableNames(database: FormanDatabase) {
  return database
    .all<{ name: string }>(sql`
      select name
      from sqlite_master
      where type = 'table'
        and name <> '__drizzle_migrations'
        and name not like 'sqlite_%'
      order by name
    `)
    .map(({ name }) => name);
}

function hasBaseline(database: FormanDatabase, baseline: MigrationBaseline) {
  if (migrationCount(database) === 0) return false;
  return Boolean(database.get<{ hash: string }>(sql`
    select hash
    from __drizzle_migrations
    where hash = ${baseline.hash}
    limit 1
  `));
}

export function runMigrations(database: FormanDatabase) {
  const baseline = currentMigrationBaseline();
  const existingTables = tableNames(database);

  if (existingTables.length > 0) {
    if (!hasBaseline(database, baseline)) {
      throw new Error("This database does not match the current Forman baseline");
    }
    const before = migrationCount(database);
    migrate(database, { migrationsFolder: migrationFolder });
    return { initialized: false, applied: migrationCount(database) - before };
  }

  if (migrationCount(database) > 0) {
    throw new Error("This database does not match the current Forman baseline");
  }

  migrate(database, { migrationsFolder: migrationFolder });
  return { initialized: true, applied: migrationCount(database) };
}
