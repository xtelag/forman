import { eq } from "drizzle-orm";
import { z } from "zod";
import type { createDatabase } from "@/server/db/client";
import { sources } from "@/server/db/schema";
import { honeypotFieldNamesSchema } from "@/shared/honeypot";
import { sessionSettingsSchema } from "@/shared/contracts/source-session";
import { isSafeSuccessUrl } from "@/shared/contracts/sources";

export const sourceConfigurationDocumentSchema = z.object({
  allowedOrigins: z.array(z.string().url().refine(value => new URL(value).origin === value)).max(100).default([]),
  altchaEnabled: z.boolean().default(false),
  honeypotEnabled: z.boolean().default(false),
  honeypotFieldNames: honeypotFieldNamesSchema.default(["forman_company_website"]),
  successUrl: z.string().refine(isSafeSuccessUrl).nullable().default(null),
  maxBodyBytes: z.number().int().min(1).max(1_048_576).default(65_536),
  maxEntries: z.number().int().min(1).max(1_000).default(50),
  maxUniqueKeys: z.number().int().min(1).max(500).default(30),
  maxValuesPerKey: z.number().int().min(1).max(500).default(20),
  maxKeyLength: z.number().int().min(1).max(1_000).default(100),
  maxValueLength: z.number().int().min(1).max(100_000).default(10_000),
  submissionRateLimitPerMinute: z.number().int().min(1).max(100_000).nullable().default(null),
  challengeRateLimitPerMinute: z.number().int().min(1).max(100_000).nullable().default(null),
  storeUserAgent: z.boolean().default(false),
  storeReferer: z.boolean().default(false),
  fieldDefinitionMode: z.literal("json-schema").nullable().default(null),
  fieldDefinitionSource: z.string().max(100_000).nullable().default(null),
  session: sessionSettingsSchema.omit({ enabled: true }).default({ inactivityDays: 30, completedRetentionDays: 30 }),
}).strict();

export type SourceConfigurationDocument = z.infer<typeof sourceConfigurationDocumentSchema>;
type Database = ReturnType<typeof createDatabase>["db"];
export function withSourceConfiguration(row: typeof sources.$inferSelect) {
  const { configuration, ...identity } = row;
  return { ...identity, ...sourceConfigurationDocumentSchema.parse(configuration) };
}
export function sourceById(database: Pick<Database, "select">, id: string) {
  const row = database.select().from(sources).where(eq(sources.id, id)).get();
  return row ? withSourceConfiguration(row) : null;
}
export function mutateSourceConfiguration(
  database: Database, id: string,
  update: (current: SourceConfigurationDocument) => Partial<SourceConfigurationDocument>,
) {
  return database.transaction(transaction => {
    const row = transaction.select().from(sources).where(eq(sources.id, id)).get();
    if (!row) return false;
    const current = sourceConfigurationDocumentSchema.parse(row.configuration);
    const configuration = sourceConfigurationDocumentSchema.parse({ ...current, ...update(current) });
    transaction.update(sources).set({ configuration, updatedAt: new Date() }).where(eq(sources.id, id)).run();
    return true;
  }, { behavior: "immediate" });
}
