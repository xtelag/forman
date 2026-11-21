import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).notNull();

export const administrators = sqliteTable("administrator", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isInitialPassword: integer("is_initial_password", { mode: "boolean" })
    .notNull()
    .default(true),
  passwordChangedAt: timestamp("password_changed_at"),
  createdAt: timestamp("created_at"),
});

export const administratorSessions = sqliteTable(
  "administrator_session",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at"),
    lastSeenAt: timestamp("last_seen_at"),
  },
  (table) => [
    index("administrator_session_last_seen_at_idx").on(table.lastSeenAt),
  ],
);

export const sources = sqliteTable(
  "source",
  {
    type: text("type", { enum: ["one-shot", "session", "m2m"] }).notNull().default("one-shot"),
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    configuration: text("configuration_json", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    retentionDays: integer("retention_days"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("source_source_id_idx").on(table.sourceId),
    check("source_configuration_object", sql`json_valid(${table.configuration}) AND json_type(${table.configuration}) = 'object'`),
  ],
);

export const pages = sqliteTable(
  "page",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    name: text("name").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    presentationJson: text("presentation_json"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("page_page_id_idx").on(table.pageId),
    index("page_source_id_idx").on(table.sourceId),
  ],
);

export const tags = sqliteTable(
  "tag",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color", {
      enum: ["rose", "coral", "peach", "amber", "lemon", "mint", "emerald", "teal", "sky", "blue", "indigo", "violet", "fuchsia"],
    }).notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [uniqueIndex("tag_name_idx").on(table.name)],
);

export const sourceTags = sqliteTable(
  "source_tag",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("source_tag_form_tag_idx").on(table.sourceId, table.tagId)],
);

export const submissions = sqliteTable(
  "submission",
  {
    sessionUpdateCount: integer("session_update_count"),
    sessionRequestCount: integer("session_request_count"),
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    payloadJson: text("payload_json").notNull(),
    clientIp: text("client_ip"),
    createdAt: timestamp("created_at"),
    userAgent: text("user_agent"),
    referer: text("referer"),
  },
  (table) => [
    index("submission_form_created_at_idx").on(table.sourceId, table.createdAt),
    index("submission_created_at_idx").on(table.createdAt),
  ],
);

export const consumedChallenges = sqliteTable(
  "consumed_challenge",
  {
    challengeId: text("challenge_id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at"),
    consumedAt: timestamp("consumed_at"),
  },
  (table) => [index("consumed_challenge_expires_at_idx").on(table.expiresAt)],
);

export const serverSubmissionTokens = sqliteTable("server_submission_token", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  issuedAt: timestamp("issued_at"),
  rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
});

export const globalSettings = sqliteTable("global_setting", {
  id: text("id").primaryKey().default("global"),
  configuration: text("configuration_json", { mode: "json" })
    .$type<Record<string, unknown>>().notNull().default({}),
  adminPasswordResetFingerprint: text("admin_password_reset_fingerprint"),
  updatedAt: timestamp("updated_at").default(sql`(unixepoch() * 1000)`),
}, (table) => [
  check("global_setting_configuration_object", sql`json_valid(${table.configuration}) AND json_type(${table.configuration}) = 'object'`),
]);

export const pipelines = sqliteTable("pipeline", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [uniqueIndex("pipeline_source_name_idx").on(table.sourceId, table.name), index("pipeline_source_id_idx").on(table.sourceId)]);

export const pipelineActions = sqliteTable("pipeline_action", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  type: text("action_type", { enum: ["transformation", "webhook", "callback", "callback_boolean", "email", "email_confirmation", "inbox", "couchdb"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  conditionJson: text("condition_json"),
  conditionMissBehavior: text("condition_miss_behavior", { enum: ["skip_action", "skip_remaining"] }).notNull().default("skip_action"),
  blocking: integer("blocking", { mode: "boolean" }).notNull().default(false),
  failurePolicy: text("failure_policy", { enum: ["bypass", "cancel"] }),
  maximumAttempts: integer("maximum_attempts").notNull().default(3),
  configurationJson: text("configuration_json").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [uniqueIndex("pipeline_action_position_idx").on(table.pipelineId, table.position), index("pipeline_action_pipeline_id_idx").on(table.pipelineId)]);

export const pipelineRuns = sqliteTable("pipeline_run", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").references(() => pipelines.id, { onDelete: "set null" }),
  submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  pipelineName: text("pipeline_name").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  status: text("status", { enum: ["pending", "processing", "completed", "completed_attention", "cancelled"] }).notNull().default("pending"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [uniqueIndex("pipeline_run_submission_pipeline_idx").on(table.submissionId, table.pipelineId), index("pipeline_run_pipeline_created_idx").on(table.pipelineId, table.createdAt), index("pipeline_run_submission_id_idx").on(table.submissionId),
  index("pipeline_run_created_id_idx").on(table.createdAt, table.id),
  index("pipeline_run_source_created_id_idx").on(table.sourceId, table.createdAt, table.id),
  index("pipeline_run_status_created_id_idx").on(table.status, table.createdAt, table.id),
  index("pipeline_run_pipeline_created_id_idx").on(table.pipelineId, table.createdAt, table.id),
]);

export const pipelineActionRuns = sqliteTable("pipeline_action_run", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => pipelineRuns.id, { onDelete: "cascade" }),
  actionId: text("action_id").references(() => pipelineActions.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  type: text("action_type", { enum: ["transformation", "webhook", "callback", "callback_boolean", "email", "email_confirmation", "inbox", "couchdb"] }).notNull(),
  blocking: integer("blocking", { mode: "boolean" }).notNull(),
  failurePolicy: text("failure_policy", { enum: ["bypass", "cancel"] }),
  maximumAttempts: integer("maximum_attempts").notNull(),
  conditionJson: text("condition_json"),
  conditionMissBehavior: text("condition_miss_behavior", { enum: ["skip_action", "skip_remaining"] }).notNull(),
  configurationJson: text("configuration_json").notNull(),
  inputPayloadJson: text("input_payload_json").notNull(),
  outputPayloadJson: text("output_payload_json"),
  status: text("status", { enum: ["pending", "processing", "waiting_callback", "retry_scheduled", "completed", "skipped_condition", "not_run", "failed", "bypassed", "cancelled"] }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
  callbackToken: text("callback_token").unique(),
  callbackExpiresAt: integer("callback_expires_at", { mode: "timestamp_ms" }),
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [uniqueIndex("pipeline_action_run_position_idx").on(table.runId, table.position), index("pipeline_action_run_due_idx").on(table.status, table.nextAttemptAt), index("pipeline_action_run_run_status_idx").on(table.runId, table.status)]);

export const emailConfirmationSessions = sqliteTable("email_confirmation_session", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  recipientFingerprint: text("recipient_fingerprint").notNull(),
  capabilityHash: text("capability_hash").notNull().unique(),
  ownerActionRunId: text("owner_action_run_id").notNull().references(() => pipelineActionRuns.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["waiting", "confirmed", "expired"] }).notNull(),
  expiresAt: timestamp("expires_at"),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [index("email_confirmation_session_active_idx").on(table.sourceId, table.pipelineId, table.recipientFingerprint, table.status, table.expiresAt)]);

export const emailConfirmationSessionActions = sqliteTable("email_confirmation_session_action", {
  sessionId: text("session_id").notNull().references(() => emailConfirmationSessions.id, { onDelete: "cascade" }),
  actionRunId: text("action_run_id").notNull().unique().references(() => pipelineActionRuns.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.sessionId, table.actionRunId] })]);

export const configuredInboxItems = sqliteTable("inbox_item", {
  id: text("id").primaryKey(),
  pipelineActionRunId: text("pipeline_action_run_id").notNull().unique().references(() => pipelineActionRuns.id, { onDelete: "cascade" }),
  sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
  submissionId: text("submission_id").references(() => submissions.id, { onDelete: "set null" }),
  sourceName: text("source_name").notNull(),
  actionName: text("action_name").notNull(),
  payloadJson: text("payload_json").notNull(),
  state: text("state", { enum: ["unread", "read", "archived"] }).notNull().default("unread"),
  preTrashState: text("pre_trash_state", { enum: ["unread", "read", "archived"] }),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  trashedAt: integer("trashed_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (table) => [index("inbox_item_source_trashed_created_idx").on(table.sourceId, table.trashedAt, table.createdAt), index("inbox_item_trashed_created_idx").on(table.trashedAt, table.createdAt)]);


export const sourceSessions = sqliteTable("source_session", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  currentPage: integer("current_page").notNull().default(1),
  keyHash: text("key_hash").notNull(),
  status: text("status", { enum: ["draft", "completed", "expired"] }).notNull().default("draft"),
  payloadJson: text("payload_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(0),
  updateCount: integer("update_count").notNull().default(0),
  requestCount: integer("request_count").notNull().default(0),
  submissionId: text("submission_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  expiresAt: timestamp("expires_at"),
}, table => [uniqueIndex("source_session_key_idx").on(table.sourceId, table.keyHash), index("source_session_expiry_idx").on(table.expiresAt), index("source_session_list_idx").on(table.sourceId, table.createdAt)]);
export const sourceSessionOperations = sqliteTable("source_session_operation", {
  sessionId: text("session_id").notNull().references(() => sourceSessions.id, { onDelete: "cascade" }),
  operationId: text("operation_id").notNull(),
  requestHash: text("request_hash").notNull(),
}, table => [primaryKey({ columns: [table.sessionId, table.operationId] })]);
