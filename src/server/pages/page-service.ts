import { sourceById, sourceConfigurationDocumentSchema } from "@/server/sources/source-configuration-document";
import { formLayout } from "@/shared/form-layout";
import { randomInt } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { createDatabase } from "@/server/db/client";
import { sources, pages } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { sourceFieldsColumns } from "@/server/sources/source-fields";

import { createPageViewModel } from "./page-view-model";
import { validPageValue } from "@/shared/page-form";
import { pagePresentationSchema as presentationSchema, type PagePresentation } from "@/shared/contracts/page";
export type { PagePresentation } from "@/shared/contracts/page";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

const publicIdAlphabet = "abcdefghjkmnpqrstuvwxyz023456789";
const generatedPageIdLength = 10;
const maxPageIdAttempts = 10;

const pageIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
  .refine((value) => !value.includes("--"));
const createPageSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
  })
  .strict();
const updatePageSchema = z
  .object({
    enabled: z.boolean(),
    name: z.string().trim().min(1).max(120),
    presentation: presentationSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);


export type PageRecord = {
  altchaEnabled: boolean;
  createdAt: Date;
  enabled: boolean;
  fieldDefinitionMode: "json-schema" | null;
  fieldDefinitionSource: string | null;
  sourceEnabled: boolean;
  sourceType: "one-shot" | "session" | "m2m";
  sessionsEnabled?: boolean;
  sourceId: string;
  sourceName: string;
  sourcePublicId: string;
  honeypotEnabled: boolean;
  honeypotFieldNames: string[];
  id: string;
  name: string;
  pageId: string;
  presentation: PagePresentation | null;
  updatedAt: Date;
};

export type PageMutationResult =
  | "invalid"
  | "missing"
  | PageRecord;

export type PageCreateResult =
  | "invalid"
  | "missing-source"
  | "source-fields-required"
  | PageRecord;

const pageSelection = {
  configuration: sources.configuration,
  createdAt: pages.createdAt,
  enabled: pages.enabled,
  sourceEnabled: sources.enabled,
  sourceType: sources.type,
  sessionsEnabled: sql<boolean>`${sources.type} = 'session'`.mapWith(Boolean),
  sourceId: pages.sourceId,
  sourceName: sources.name,
  sourcePublicId: sources.sourceId,
  id: pages.id,
  name: pages.name,
  pageId: pages.pageId,
  presentationJson: pages.presentationJson,
  updatedAt: pages.updatedAt,
};

function generatedPageId() {
  return Array.from(
    { length: generatedPageIdLength },
    () => publicIdAlphabet[randomInt(publicIdAlphabet.length)],
  ).join("");
}

function parsePresentation(value: string | null): PagePresentation | null {
  if (!value) return null;
  const parsed = presentationSchema.safeParse(JSON.parse(value));
  if (!parsed.success) throw new Error("Invalid Page presentation");
  return parsed.data;
}

function toPageRecord(
  record: Omit<PageRecord, "presentation" | "altchaEnabled" | "fieldDefinitionMode" | "fieldDefinitionSource" | "honeypotEnabled" | "honeypotFieldNames"> & {
    presentationJson: string | null; configuration: Record<string, unknown>;
  },
): PageRecord {
  const { presentationJson, configuration, ...identity } = record;
  const { altchaEnabled, fieldDefinitionMode, fieldDefinitionSource, honeypotEnabled, honeypotFieldNames } = sourceConfigurationDocumentSchema.parse(configuration);
  const page = { ...identity, altchaEnabled, fieldDefinitionMode, fieldDefinitionSource, honeypotEnabled, honeypotFieldNames };
  const presentation = parsePresentation(presentationJson);
  if (presentation && page.fieldDefinitionMode && page.fieldDefinitionSource) {
    try {
      const names = sourceFieldsColumns(page.fieldDefinitionMode, page.fieldDefinitionSource);
      presentation.fields = formLayout(names.map(name => ({ name })), presentation).fields;
      if (presentation.fallbacks) presentation.fallbacks = Object.fromEntries(Object.entries(presentation.fallbacks).filter(([name]) => names.includes(name)));
    } catch { /* The Source editor reports invalid definitions. */ }
  }
  return { ...page, presentation };
}

function canPublish(record: {
  fieldDefinitionMode: "json-schema" | null;
  fieldDefinitionSource: string | null;
}) {
  if (!record.fieldDefinitionMode || !record.fieldDefinitionSource)
    return false;
  try {
    return (
      sourceFieldsColumns(
        record.fieldDefinitionMode,
        record.fieldDefinitionSource,
      ).length > 0
    );
  } catch {
    return false;
  }
}

export async function listPages(
  database: FormanDatabase,
): Promise<PageRecord[]> {
  const records = await database
    .select(pageSelection)
    .from(pages)
    .innerJoin(sources, eq(pages.sourceId, sources.id))
    .orderBy(desc(pages.updatedAt))
    .all();
  return records.map(toPageRecord);
}

export async function findPageByPublicId(
  database: FormanDatabase,
  publicPageId: string,
): Promise<PageRecord | null> {
  const normalized = publicPageId.trim().toLowerCase();
  const record = await database
    .select(pageSelection)
    .from(pages)
    .innerJoin(sources, eq(pages.sourceId, sources.id))
    .where(sql`lower(${pages.pageId}) = ${normalized}`)
    .get();
  return record ? toPageRecord(record) : null;
}

export async function createPage(
  database: FormanDatabase,
  input: unknown,
  generatePageId: () => string = generatedPageId,
): Promise<PageCreateResult> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success) return "invalid";
  const source = sourceById(database, parsed.data.sourceId);
  if (!source) return "missing-source";
  if (source.type === "m2m") return "invalid";
  if (!canPublish(source)) return "source-fields-required";

  for (let attempt = 0; attempt < maxPageIdAttempts; attempt += 1) {
    const pageId = pageIdSchema.safeParse(generatePageId());
    if (!pageId.success) return "invalid";
    const id = createResourceId();
    const now = new Date();
    const inserted = await database
      .insert(pages)
      .values({
        createdAt: now,
        enabled: false,
        sourceId: parsed.data.sourceId,
        id,
        name: parsed.data.name,
        pageId: pageId.data,
        presentationJson: JSON.stringify({
          ...(source.type === "session" ? { steps: sourceFieldsColumns(source.fieldDefinitionMode, source.fieldDefinitionSource).map((_, index) => ({ id: index + 1, title: "" })) } : {}),
          fields: sourceFieldsColumns(source.fieldDefinitionMode, source.fieldDefinitionSource).map((name, order) => ({ name, order, step: source.type === "session" ? order + 1 : 1 })),
        }),
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
    if (inserted.changes === 1) {
      const page = await findPageByPublicId(database, pageId.data);
      if (!page) throw new Error("Created Page could not be loaded");
      return page;
    }
  }
  throw new Error("Unable to generate a unique Page ID");
}

export async function updatePage(
  database: FormanDatabase,
  currentPageId: string,
  input: unknown,
): Promise<PageMutationResult> {
  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success) return "invalid";
  const current = await findPageByPublicId(database, currentPageId);
  if (!current) return "missing";
  if (current.sourceType === "m2m") return "invalid";
  const presentation = parsed.data.presentation === undefined ? current.presentation : parsed.data.presentation;
  if (parsed.data.enabled && !canPublish(current)) return "invalid";
  if ((parsed.data.presentation !== undefined || parsed.data.enabled === true) && current.fieldDefinitionMode && current.fieldDefinitionSource) {
    try {
      const fields = createPageViewModel({ mode: current.fieldDefinitionMode, source: current.fieldDefinitionSource, presentation }).fields;
      if (fields.some(field => field.defaultValue !== undefined && !validPageValue(field, field.defaultValue, false))) return "invalid";
    } catch { return "invalid"; }
  }

  await database
    .update(pages)
    .set({
      enabled: parsed.data.enabled,
      name: parsed.data.name,
      ...(parsed.data.presentation === undefined ? {} : { presentationJson: presentation === null ? null : JSON.stringify(presentation) }),
      updatedAt: new Date(),
    })
    .where(eq(pages.id, current.id))
    .run();

  const updated = await findPageByPublicId(database, current.pageId);
  if (!updated) throw new Error("Updated Page could not be loaded");
  return updated;
}

export async function deletePage(
  database: FormanDatabase,
  publicPageId: string,
) {
  const page = await findPageByPublicId(database, publicPageId);
  if (!page) return false;
  const result = await database
    .delete(pages)
    .where(eq(pages.id, page.id))
    .run();
  return result.changes === 1;
}
