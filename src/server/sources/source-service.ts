import { withSourceConfiguration, sourceConfigurationDocumentSchema } from "./source-configuration-document";
import { sourceTypeSchema, type SourceType } from "@/shared/source-type";
import { randomInt } from "node:crypto";

import { and, count, desc, eq, sql } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import { pages, pipelines, sources, submissions } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { selectHoneypotFieldName } from "@/server/anti-abuse/honeypot-field-names";
import { listTagsForSources } from "@/server/tags/tag-service";
import { issueServerSubmissionToken } from "./server-token-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type CreateSourceInput = {
  type: SourceType;
  name: string;
};

export type SourceRecord = {
  type: SourceType;
  allowedOrigins: string[];
  altchaEnabled: boolean;
  enabled: boolean;
  fieldDefinitionMode: "json-schema" | null;
  fieldDefinitionSource: string | null;
  sourceId: string;
  honeypotEnabled: boolean;
  honeypotFieldNames: string[];
  id: string;
  name: string;
  retentionDays: number | null;
  challengeRateLimitPerMinute: number | null;
  storeReferer: boolean;
  storeUserAgent: boolean;
  submissionRateLimitPerMinute: number | null;
};

const sourceIdAlphabet = "abcdefghjkmnpqrstuvwxyz023456789";
const sourceIdLength = 10;
const maxSourceIdAttempts = 10;

export class FriendlyNameConflictError extends Error {
  constructor() {
    super("A Source with this name already exists");
  }
}

export function normalizeSourceId(value: string) {
  return value.toLowerCase();
}

export function normalizeFriendlyName(value: string) {
  return value.trim();
}

export function isFriendlyNameConflict(error: unknown) {
  return error instanceof Error && error.message.includes("source_friendly_name_normalized_idx");
}

function publicSourceId() {
  return Array.from(
    { length: sourceIdLength },
    () => sourceIdAlphabet[randomInt(sourceIdAlphabet.length)],
  ).join("");
}

export async function createSource(
  database: FormanDatabase,
  { name, type }: CreateSourceInput,
  generateSourceId = publicSourceId,
) {
  sourceTypeSchema.parse(type);
  const friendlyName = normalizeFriendlyName(name);
  const altchaEnabled = type !== "m2m";
  for (let attempt = 0; attempt < maxSourceIdAttempts; attempt += 1) {
    const id = createResourceId();
    const sourceId = generateSourceId();
    const honeypotFieldNames = [selectHoneypotFieldName()];
    const now = new Date();
    const result = await database
      .insert(sources)
      .values({ id, type, sourceId, configuration: sourceConfigurationDocumentSchema.parse({ altchaEnabled, honeypotFieldNames }), name: friendlyName, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();

    if (result.changes === 1) {
      if (type === "m2m") await issueServerSubmissionToken(database, id);
      return {
        type,
        id,
        sourceId,
        name: friendlyName,
        enabled: true,
        fieldDefinitionMode: null,
        fieldDefinitionSource: null,
        allowedOrigins: [],
        altchaEnabled,
        challengeRateLimitPerMinute: null,
        honeypotEnabled: false,
        honeypotFieldNames,
        retentionDays: null,
        storeReferer: false,
        storeUserAgent: false,
        submissionRateLimitPerMinute: null,
      } satisfies SourceRecord;
    }

    const existingName = await database
      .select({ id: sources.id })
      .from(sources)
      .where(sql`lower(trim(${sources.name})) = lower(trim(${friendlyName}))`)
      .get();
    if (existingName) throw new FriendlyNameConflictError();
  }

  throw new Error("Unable to generate a unique Source ID");
}

export async function listSources(database: FormanDatabase, now = new Date()) {
  const day = 86_400_000;
  const [records, pipelineCounts, pageCounts, submissionStats] = await Promise.all([
    database.select().from(sources).orderBy(desc(sources.updatedAt)).all(),
    database.select({ sourceId: pipelines.sourceId, value: count() }).from(pipelines).groupBy(pipelines.sourceId).all(),
    database.select({ sourceId: pages.sourceId, value: count() }).from(pages).groupBy(pages.sourceId).all(),
    database.all<{ sourceId: string; id: string; createdAt: number; totalSubmissionCount: number; submissionsLast24Hours: number; submissionsLast7Days: number; submissionsLast30Days: number }>(sql`
      select source_id as sourceId, count(*) as totalSubmissionCount,
        count(case when created_at >= ${now.getTime() - day} then 1 end) as submissionsLast24Hours,
        count(case when created_at >= ${now.getTime() - 7 * day} then 1 end) as submissionsLast7Days,
        count(case when created_at >= ${now.getTime() - 30 * day} then 1 end) as submissionsLast30Days,
        max(created_at) as createdAt,
        (select latest.id from submission as latest where latest.source_id = submission.source_id
          order by latest.created_at desc, latest.id desc limit 1) as id
      from ${submissions} group by source_id
    `),
  ]);
  const pipelineCountBySourceId = new Map(pipelineCounts.map(({ sourceId, value }) => [sourceId, value]));
  const pageCountBySourceId = new Map(pageCounts.map(({ sourceId, value }) => [sourceId, value]));
  const latestSubmissionBySourceId = new Map(submissionStats.map((submission) => [submission.sourceId, submission]));
  const tagsBySourceId = await listTagsForSources(database, records.map((source) => source.id));

  return records.map(withSourceConfiguration).map((source) => ({
    type: source.type,
    id: source.id,
    sourceId: source.sourceId,
    name: source.name,
    enabled: source.enabled,
    fieldDefinitionMode: source.fieldDefinitionMode,
    fieldDefinitionSource: source.fieldDefinitionSource,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    pipelineCount: pipelineCountBySourceId.get(source.id) ?? 0,
    pageCount: pageCountBySourceId.get(source.id) ?? 0,
    lastSubmission: latestSubmissionBySourceId.get(source.id)
      ? { createdAt: new Date(latestSubmissionBySourceId.get(source.id)!.createdAt).toISOString(), id: latestSubmissionBySourceId.get(source.id)!.id }
      : null,
    totalSubmissionCount: latestSubmissionBySourceId.get(source.id)?.totalSubmissionCount ?? 0,
    submissionsLast24Hours: latestSubmissionBySourceId.get(source.id)?.submissionsLast24Hours ?? 0,
    submissionsLast7Days: latestSubmissionBySourceId.get(source.id)?.submissionsLast7Days ?? 0,
    submissionsLast30Days: latestSubmissionBySourceId.get(source.id)?.submissionsLast30Days ?? 0,
    tags: tagsBySourceId.get(source.id) ?? [],
  }));
}

export function isAllowedOrigin(allowedOrigins: string[], origin: string) {
  return allowedOrigins.length === 0 || allowedOrigins.includes(origin);
}

export async function findSourceBySourceId(database: FormanDatabase, sourceId: string) {
  const source = await database.select().from(sources).where(sql`lower(${sources.sourceId}) = ${normalizeSourceId(sourceId)}`).get();
  return source ? withSourceConfiguration(source) : null;
}

export async function findActiveSourceBySourceId(database: FormanDatabase, sourceId: string) {
  const source = await database
    .select()
    .from(sources)
    .where(and(sql`lower(${sources.sourceId}) = ${normalizeSourceId(sourceId)}`, eq(sources.enabled, true)))
    .get();

  return source ? withSourceConfiguration(source) : null;
}
