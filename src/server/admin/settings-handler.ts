import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import {
  getGlobalSettings,
  updateGlobalSettings,
} from "@/server/config/global-settings";
import {
  getSmtpSettings,
  removeSmtpPassword,
  saveSmtpSettings,
  sendSmtpTestEmail,
} from "@/server/config/smtp-settings";
import type { createDatabase } from "@/server/db/client";
import type { AdminSettings } from "@/shared/contracts/admin";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function toAdminSettings(
  database: FormanDatabase,
  settings: Awaited<ReturnType<typeof getGlobalSettings>>,
): Promise<AdminSettings> {
  return {
    adminSessionIdleDays: settings.adminSessionIdleDays,
    adminSessionAbsoluteDays: settings.adminSessionAbsoluteDays,
    altchaMaxNumber: settings.altchaMaxNumber,
    challengeRateLimitPerMinute: settings.challengeRateLimitPerMinute,
    challengeTtlSeconds: settings.challengeTtlSeconds,
    clientBurstLimit: settings.clientBurstLimit,
    clientRateLimitPerMinute: settings.clientRateLimitPerMinute,
    sourceRateLimitPerMinute: settings.sourceRateLimitPerMinute,
    formspreeCompatibilityEndpointEnabled:
      settings.formspreeCompatibilityEndpointEnabled,
    failedActionRetentionDays: settings.failedActionRetentionDays,
    inboxRetentionDays: settings.inboxRetentionDays,
    loginFailureLimit: settings.loginFailureLimit,
    loginFailureWindowSeconds: settings.loginFailureWindowSeconds,
    rateLimiterCapacity: settings.rateLimiterCapacity,
    rateLimiterTtlSeconds: settings.rateLimiterTtlSeconds,
    robotsTxt: settings.robotsTxt,
    submissionRateLimitPerMinute: settings.submissionRateLimitPerMinute,
    webhookSsrfProtectionEnabled: settings.webhookSsrfProtectionEnabled,
    smtp: await getSmtpSettings(database),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export function createAdminSettingsHandler({
  database,
}: {
  database: FormanDatabase;
}) {
  return {
    async get(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      )
        return unauthorized();
      return Response.json(
        await toAdminSettings(database, await getGlobalSettings(database)),
      );
    },
    async update(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      )
        return unauthorized();
      const values = await request.json().catch(() => undefined);
      if (!(await updateGlobalSettings(database, values)))
        return Response.json({ error: "Invalid settings" }, { status: 400 });
      return Response.json(
        await toAdminSettings(database, await getGlobalSettings(database)),
      );
    },
    async updateSmtp(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      )
        return unauthorized();
      try {
        return Response.json(
          await saveSmtpSettings(database, await request.json()),
        );
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "Invalid SMTP settings",
          },
          { status: 400 },
        );
      }
    },
    async removeSmtpPassword(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      )
        return unauthorized();
      await removeSmtpPassword(database);
      return Response.json(await getSmtpSettings(database));
    },
    async testSmtp(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      )
        return unauthorized();
      try {
        await sendSmtpTestEmail(database, await request.json());
        return new Response(null, { status: 204 });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "SMTP test email failed",
          },
          { status: 400 },
        );
      }
    },
  };
}
