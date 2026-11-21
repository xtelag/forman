-- Current Forman schema. Fresh installations only; no historical upgrade path.
CREATE TABLE `administrator` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL UNIQUE,
  `password_hash` text NOT NULL,
  `is_initial_password` integer DEFAULT true NOT NULL,
  `password_changed_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `administrator_session` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `created_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consumed_challenge` (
  `challenge_id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `consumed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_confirmation_session` (`id` text PRIMARY KEY NOT NULL, `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE, `pipeline_id` text NOT NULL REFERENCES `pipeline`(`id`) ON DELETE CASCADE, `recipient_fingerprint` text NOT NULL, `capability_hash` text NOT NULL UNIQUE, `owner_action_run_id` text NOT NULL REFERENCES `pipeline_action_run`(`id`) ON DELETE CASCADE, `status` text NOT NULL CHECK (`status` IN ('waiting', 'confirmed', 'expired')), `expires_at` integer NOT NULL, `confirmed_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `email_confirmation_session_action` (`session_id` text NOT NULL REFERENCES `email_confirmation_session`(`id`) ON DELETE CASCADE, `action_run_id` text NOT NULL UNIQUE REFERENCES `pipeline_action_run`(`id`) ON DELETE CASCADE, PRIMARY KEY (`session_id`, `action_run_id`));
--> statement-breakpoint
CREATE TABLE `inbox_item` (
  `id` text PRIMARY KEY NOT NULL,
  "pipeline_action_run_id" text NOT NULL UNIQUE REFERENCES "pipeline_action_run"(`id`) ON DELETE CASCADE,
  `source_id` text REFERENCES `source`(`id`) ON DELETE SET NULL,
  `submission_id` text REFERENCES `submission`(`id`) ON DELETE SET NULL,
  `source_name` text NOT NULL,
  `action_name` text NOT NULL,
  `payload_json` text NOT NULL,
  `state` text NOT NULL DEFAULT 'unread',
  `pre_trash_state` text,
  `read_at` integer,
  `archived_at` integer,
  `trashed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page` (
  `id` text PRIMARY KEY NOT NULL,
  `page_id` text NOT NULL,
  `name` text NOT NULL,
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `enabled` integer NOT NULL DEFAULT false,
  `presentation_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_action" (`id` text PRIMARY KEY NOT NULL, `pipeline_id` text NOT NULL REFERENCES `pipeline`(`id`) ON DELETE CASCADE, `name` text NOT NULL, `position` integer NOT NULL, `action_type` text NOT NULL CHECK (`action_type` IN ('transformation', 'webhook', 'callback', 'callback_boolean', 'email', 'email_confirmation', 'inbox', 'couchdb')), `enabled` integer NOT NULL DEFAULT 1, `condition_json` text, `condition_miss_behavior` text NOT NULL DEFAULT 'skip_action' CHECK (`condition_miss_behavior` IN ('skip_action', 'skip_remaining')), `blocking` integer NOT NULL DEFAULT 0, `failure_policy` text CHECK (`failure_policy` IN ('bypass', 'cancel')), `maximum_attempts` integer NOT NULL DEFAULT 3, `configuration_json` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, UNIQUE (`pipeline_id`, `position`));
--> statement-breakpoint
CREATE TABLE "pipeline_action_run" (`id` text PRIMARY KEY NOT NULL, `run_id` text NOT NULL REFERENCES `pipeline_run`(`id`) ON DELETE CASCADE, `action_id` text REFERENCES `pipeline_action`(`id`) ON DELETE SET NULL, `name` text NOT NULL, `position` integer NOT NULL, `action_type` text NOT NULL CHECK (`action_type` IN ('transformation', 'webhook', 'callback', 'callback_boolean', 'email', 'email_confirmation', 'inbox', 'couchdb')), `blocking` integer NOT NULL, `failure_policy` text CHECK (`failure_policy` IN ('bypass', 'cancel')), `maximum_attempts` integer NOT NULL, `condition_json` text, `condition_miss_behavior` text NOT NULL CHECK (`condition_miss_behavior` IN ('skip_action', 'skip_remaining')), `configuration_json` text NOT NULL, `input_payload_json` text NOT NULL, `output_payload_json` text, `status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'waiting_callback', 'retry_scheduled', 'completed', 'skipped_condition', 'not_run', 'failed', 'bypassed', 'cancelled')), `attempt_count` integer NOT NULL DEFAULT 0, `next_attempt_at` integer, `callback_expires_at` integer, `error_summary` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `callback_token` text, UNIQUE (`run_id`, `position`));
--> statement-breakpoint
CREATE TABLE "pipeline_run" (
  `id` text PRIMARY KEY NOT NULL,
  "pipeline_id" text REFERENCES "pipeline"(`id`) ON DELETE SET NULL,
  `submission_id` text NOT NULL REFERENCES `submission`(`id`) ON DELETE CASCADE,
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  "pipeline_name" text NOT NULL,
  `snapshot_json` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'completed', 'completed_attention', 'cancelled')),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  UNIQUE (`submission_id`, "pipeline_id")
);
--> statement-breakpoint
CREATE TABLE `server_submission_token` (
  `source_id` text PRIMARY KEY NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `token` text NOT NULL,
  `token_prefix` text NOT NULL,
  `issued_at` integer NOT NULL,
  `rotated_at` integer
);
--> statement-breakpoint
CREATE TABLE `source` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL,
  `name` text NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `retention_days` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  type TEXT NOT NULL DEFAULT 'one-shot' CHECK (type IN ('one-shot', 'session', 'm2m')), configuration_json text NOT NULL DEFAULT '{}' CHECK (json_valid(configuration_json) AND json_type(configuration_json) = 'object'));
--> statement-breakpoint
CREATE TABLE source_session (id text PRIMARY KEY NOT NULL, source_id text NOT NULL REFERENCES source(id) ON DELETE CASCADE, key_hash text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'completed', 'expired')), payload_json text NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0, update_count integer NOT NULL DEFAULT 0, request_count integer NOT NULL DEFAULT 0, submission_id text, created_at integer NOT NULL, updated_at integer NOT NULL, expires_at integer NOT NULL, current_page integer NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE source_session_operation (session_id text NOT NULL REFERENCES source_session(id) ON DELETE CASCADE, operation_id text NOT NULL, request_hash text NOT NULL, PRIMARY KEY(session_id, operation_id));
--> statement-breakpoint
CREATE TABLE `source_tag` (
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `tag_id` text NOT NULL REFERENCES `tag`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`source_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `submission` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL REFERENCES `source`(`id`) ON DELETE CASCADE,
  `payload_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `user_agent` text,
  `referer` text,
  `client_ip` text
, session_update_count integer, session_request_count integer);
--> statement-breakpoint
CREATE TABLE `tag` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL COLLATE NOCASE,
  `color` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consumed_challenge_expires_at_idx` ON `consumed_challenge` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `email_confirmation_session_active_idx` ON `email_confirmation_session` (`source_id`, `pipeline_id`, `recipient_fingerprint`, `status`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `inbox_item_source_trashed_created_idx` ON `inbox_item` (`source_id`, `trashed_at`, `created_at`);
--> statement-breakpoint
CREATE INDEX `inbox_item_trashed_created_idx` ON `inbox_item` (`trashed_at`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_page_id_idx` ON `page` (`page_id`);
--> statement-breakpoint
CREATE INDEX `page_source_id_idx` ON `page` (`source_id`);
--> statement-breakpoint
CREATE INDEX `pipeline_action_pipeline_id_idx` ON `pipeline_action` (`pipeline_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_action_run_callback_token_idx` ON `pipeline_action_run` (`callback_token`);
--> statement-breakpoint
CREATE INDEX `pipeline_action_run_due_idx` ON `pipeline_action_run` (`status`, `next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `pipeline_action_run_run_status_idx` ON `pipeline_action_run` (`run_id`, `status`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_created_id_idx` ON `pipeline_run` (`created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_pipeline_created_id_idx` ON `pipeline_run` (`pipeline_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_pipeline_created_idx` ON `pipeline_run` (`pipeline_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_source_created_id_idx` ON `pipeline_run` (`source_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_status_created_id_idx` ON `pipeline_run` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `pipeline_run_submission_id_idx` ON `pipeline_run` (`submission_id`);
--> statement-breakpoint
CREATE INDEX `pipeline_source_id_idx` ON `pipeline` (`source_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_source_name_idx` ON `pipeline` (`source_id`, `name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_friendly_name_normalized_idx` ON `source` (lower(trim(`name`)));
--> statement-breakpoint
CREATE INDEX source_session_expiry_idx ON source_session(expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX source_session_key_idx ON source_session(source_id, key_hash);
--> statement-breakpoint
CREATE INDEX source_session_list_idx ON source_session(source_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_source_id_idx` ON `source` (`source_id`);
--> statement-breakpoint
CREATE INDEX `submission_created_at_idx` ON `submission` (`created_at`);
--> statement-breakpoint
CREATE INDEX `submission_source_created_at_idx` ON `submission` (`source_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_name_idx` ON `tag` (`name`);
--> statement-breakpoint
CREATE TRIGGER source_type_immutable BEFORE UPDATE OF type ON source
WHEN NEW.type <> OLD.type
BEGIN
  SELECT RAISE(ABORT, 'Source type is immutable');
END;
--> statement-breakpoint
CREATE TABLE "global_setting" (
  id text PRIMARY KEY DEFAULT 'global',
  configuration_json text DEFAULT '{}' NOT NULL CHECK (json_valid(configuration_json) AND json_type(configuration_json) = 'object'),
  admin_password_reset_fingerprint text,
  updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
