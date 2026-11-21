import { expireSourceSessions } from "@/server/source-sessions/session-service";
import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

import { hashPassword } from "@/server/auth/passwords";
import {
  assertSafeInitialAdminPassword,
  type Environment,
} from "@/server/config/environment";
import { getGlobalSettings, mutateSettingsDocument } from "@/server/config/global-settings";
import type { createDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import {
  administrators,
  administratorSessions,
  globalSettings,
} from "@/server/db/schema";
import { cleanupExpiredFailedActionRuns, cleanupExpiredSubmissions, moveExpiredInboxItemsToTrash } from "@/server/submissions/cleanup";
import { recoverInterruptedPipelineActions, runPipelines } from "@/server/pipelines/pipeline-run-worker";

import { runBackgroundJob } from "./background-jobs";

import { FORMAN_BANNER } from "./banner";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type StartupDependencies = {
  database: FormanDatabase;
  getDatabase?: () => FormanDatabase;
  environment: Environment;
  write: (value: string) => void;
  scheduleCleanup?: (job: () => Promise<void>) => void;
  schedulePipelineWorker?: (job: () => Promise<void>) => void;
};

export function resetFingerprint(password: string, sessionSecret: string) {
  return `hmac-sha256:v1:${createHmac("sha256", sessionSecret)
    .update("forman-admin-password-reset\0")
    .update(password)
    .digest("base64url")}`;
}

export function createStartupBootstrap({
  database,
  getDatabase = () => database,
  environment,
  write,
  scheduleCleanup,
  schedulePipelineWorker,
}: StartupDependencies) {
  let startPromise: Promise<void> | undefined;

  async function start() {
    assertSafeInitialAdminPassword(environment);
    write(FORMAN_BANNER);
    write("→ Checking database migrations");
    const { initialized, applied: appliedMigrations } = runMigrations(database);
    const migrationResult = appliedMigrations === 0
      ? "no migrations applied"
      : `${appliedMigrations} migration${appliedMigrations === 1 ? "" : "s"} applied`;
    write(initialized
      ? "✓ New database initialized"
      : `✓ Database schema ${appliedMigrations > 0 ? "updated" : "ready"} (${migrationResult})`);
    write(`→ Base origin: ${environment.baseOrigin.origin}`);

    const now = new Date();
    const administrator = await database
      .select()
      .from(administrators)
      .where(eq(administrators.id, "admin"))
      .get();

    if (!administrator) {
      await database.insert(administrators).values({
        id: "admin",
        username: "forman",
        passwordHash: await hashPassword(environment.initialAdminPassword),
        isInitialPassword: true,
        passwordChangedAt: now,
        createdAt: now,
      });
    }

    await database
      .insert(globalSettings)
      .values({ id: "global", updatedAt: now })
      .onConflictDoNothing();

    if (environment.runtimeMode === "development") {
      mutateSettingsDocument(database, () => ({ webhookSsrfProtectionEnabled: false }));
    }

    if (environment.adminPasswordReset) {
      const fingerprint = resetFingerprint(
        environment.adminPasswordReset,
        environment.sessionSecret,
      );
      const settings = await database
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.id, "global"))
        .get();

      if (settings?.adminPasswordResetFingerprint !== fingerprint) {
        const passwordHash = await hashPassword(environment.adminPasswordReset);
        database.transaction((transaction) => {
          transaction
            .update(administrators)
            .set({
              passwordHash,
              isInitialPassword: false,
              passwordChangedAt: new Date(),
            })
            .where(eq(administrators.id, "admin"))
            .run();
          transaction
            .update(globalSettings)
            .set({
              adminPasswordResetFingerprint: fingerprint,
              updatedAt: new Date(),
            })
            .where(eq(globalSettings.id, "global"))
            .run();
          transaction.delete(administratorSessions).run();
        });
      }
    }

    recoverInterruptedPipelineActions(database);
    scheduleCleanup?.(() => runBackgroundJob(environment.databasePath, async () => {
      const database = getDatabase();
      expireSourceSessions(database);
      await cleanupExpiredSubmissions(database);
      const settings = await getGlobalSettings(database);
      await cleanupExpiredFailedActionRuns(
        database,
        settings.failedActionRetentionDays,
      );
      await moveExpiredInboxItemsToTrash(database, settings.inboxRetentionDays);
    }));
    schedulePipelineWorker?.(() => runBackgroundJob(environment.databasePath, async () => {
      const database = getDatabase();
      await runPipelines({
        baseUrl: environment.baseOrigin.toString(),
        confirmationSecret: environment.sessionSecret,
        database,
      });
    }));
  }

  return {
    start: () => {
      startPromise ??= start();
      return startPromise;
    },
  };
}
