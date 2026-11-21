import { withSourceConfiguration, sourceConfigurationDocumentSchema } from "./source-configuration-document";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { honeypotFieldNamesSchema } from "@/shared/honeypot";

import type { createDatabase } from "@/server/db/client";
import { sources } from "@/server/db/schema";
import { isFriendlyNameConflict, normalizeFriendlyName } from "@/server/sources/source-service";
import { isSafeSuccessUrl } from "@/shared/contracts/sources";
import { sessionSettingsSchema } from "@/shared/contracts/source-session";
import { compileSourceFields } from "./source-fields";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

const originSchema = z.string().url().refine((value) => new URL(value).origin === value, "Origin only");
const sourceConfigurationSchema = z.object({
  sessionInactivityDays: sessionSettingsSchema.shape.inactivityDays.optional(),
  sessionCompletedRetentionDays: sessionSettingsSchema.shape.completedRetentionDays.optional(),
  allowedOrigins: z.array(originSchema).max(100),
  altchaEnabled: z.boolean(),
  challengeRateLimitPerMinute: z.number().int().min(1).max(100_000).nullable(),
  fieldDefinitionMode: z.enum(["json-schema"]).nullable().optional(),
  fieldDefinitionSource: z.string().max(100_000).nullable().optional(),
  honeypotEnabled: z.boolean(),
  honeypotFieldNames: honeypotFieldNamesSchema.optional(),
  maxBodyBytes: z.number().int().min(1_024).max(1_048_576),
  maxEntries: z.number().int().min(1).max(1_000),
  maxKeyLength: z.number().int().min(1).max(1_000),
  maxUniqueKeys: z.number().int().min(1).max(500),
  maxValueLength: z.number().int().min(1).max(100_000),
  maxValuesPerKey: z.number().int().min(1).max(500),
  name: z.string().trim().min(1).max(120),
  retentionDays: z.number().int().min(1).max(36_500).nullable(),
  storeReferer: z.boolean(),
  storeUserAgent: z.boolean(),
  submissionRateLimitPerMinute: z.number().int().min(1).max(100_000).nullable(),
  successUrl: z.string().refine(isSafeSuccessUrl).nullable(),
}).strict();

export type SourceConfiguration = z.input<typeof sourceConfigurationSchema>;
export type UpdateSourceConfigurationResult = "saved" | "invalid" | "friendly-name-conflict" | { error: string };

export async function setSourceEnabled(database: FormanDatabase, sourceId: string, enabled: boolean) {
  const result = await database
    .update(sources)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .run();
  return result.changes === 1;
}

export async function deleteDeactivatedSource(database: FormanDatabase, sourceId: string) {
  const result = await database
    .delete(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.enabled, false)))
    .run();
  return result.changes === 1;
}

export async function updateSourceConfiguration(
  database: FormanDatabase,
  sourceId: string,
  configuration: SourceConfiguration | Partial<SourceConfiguration>,
  partial = false,
) {
  try {
    return database.transaction(transaction =>
      saveSourceConfiguration(transaction, sourceId, configuration, partial),
    { behavior: "immediate" });
  } catch (error) {
    if (isFriendlyNameConflict(error)) return "friendly-name-conflict";
    throw error;
  }
}

function saveSourceConfiguration(
  transaction: Parameters<Parameters<FormanDatabase["transaction"]>[0]>[0],
  sourceId: string,
  configuration: SourceConfiguration | Partial<SourceConfiguration>,
  partial: boolean,
) {
  const row = transaction.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!row) return "invalid";
  const source = withSourceConfiguration(row);
  const currentDocument = sourceConfigurationDocumentSchema.parse(row.configuration);
  const { session, ...currentConfiguration } = currentDocument;
  const parsed = sourceConfigurationSchema.safeParse(partial
    ? { ...currentConfiguration, name: row.name, retentionDays: row.retentionDays, ...configuration }
    : configuration);
  if (!parsed.success) return "invalid" satisfies UpdateSourceConfigurationResult;
  if (source.type !== "session" && (parsed.data.sessionInactivityDays !== undefined || parsed.data.sessionCompletedRetentionDays !== undefined)) return "invalid";
  if (source.type === "m2m" && (parsed.data.altchaEnabled || parsed.data.honeypotEnabled || parsed.data.allowedOrigins.length || parsed.data.successUrl || parsed.data.challengeRateLimitPerMinute)) return "invalid";
  const fieldDefinitionMode = parsed.data.fieldDefinitionMode ?? null;
  const fieldDefinitionSource = parsed.data.fieldDefinitionSource ?? null;
  if ((fieldDefinitionMode === null) !== (fieldDefinitionSource === null)) return "invalid";
  try {
    if (fieldDefinitionMode && fieldDefinitionSource) {
      const fields = compileSourceFields(fieldDefinitionMode, fieldDefinitionSource).columns;
      const reserved = [
        ...(parsed.data.altchaEnabled ? ["altcha"] : []),
        ...(parsed.data.honeypotEnabled ? parsed.data.honeypotFieldNames ?? source.honeypotFieldNames : []),
      ];
      if (fields.some(field => reserved.includes(field))) return { error: "Source fields cannot use an enabled protection field name." };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid Source fields definition." } satisfies UpdateSourceConfigurationResult;
  }
  const { name, retentionDays, sessionInactivityDays, sessionCompletedRetentionDays, ...configurationPatch } = parsed.data;
  const document = sourceConfigurationDocumentSchema.parse({
    ...currentDocument, ...configurationPatch,
    fieldDefinitionMode, fieldDefinitionSource,
    honeypotFieldNames: parsed.data.honeypotFieldNames ?? source.honeypotFieldNames,
    session: {
      inactivityDays: sessionInactivityDays ?? session.inactivityDays,
      completedRetentionDays: sessionCompletedRetentionDays ?? session.completedRetentionDays,
    },
  });
  const result = transaction.update(sources).set({
    configuration: document, name: normalizeFriendlyName(name), retentionDays, updatedAt: new Date(),
  }).where(eq(sources.id, sourceId)).run();
  return result.changes === 1 ? "saved" : "invalid";
}
