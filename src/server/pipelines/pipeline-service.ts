import { validateJsonataExpression } from "@/server/flows/jsonata-transform";
import { normalizeWebhookConfiguration } from "./webhook-configuration";
import { couchDbConfigurationSchema } from "./couchdb-action";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";

import type { createDatabase } from "@/server/db/client";
import { pipelineRuns, pipelines, pipelineActions, sources, sourceTags, tags } from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { normalizeEmailConfirmationConfiguration } from "@/server/pipelines/email-confirmation";
import { actionConditionSchema } from "@/shared/contracts/action-condition";

type Database = ReturnType<typeof createDatabase>["db"];

const actionSchema = z.object({
  blocking: z.boolean().optional(),
  condition: actionConditionSchema.nullable().optional(),
  conditionMissBehavior: z.enum(["skip_action", "skip_remaining"]).optional(),
  configuration: z.unknown().optional(),
  enabled: z.boolean().optional(),
  failurePolicy: z.enum(["bypass", "cancel"]).optional(),
  id: z.string().optional(),
  maximumAttempts: z.number().int().min(1).max(10).optional(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["transformation", "webhook", "callback", "callback_boolean", "email", "email_confirmation", "inbox", "couchdb"]),
});

const pipelineSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(120),
  sourceId: z.string().min(1),
  steps: z.array(actionSchema).min(1).max(50),
});

const pipelineConfigurationSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(120),
  sourceId: z.string().min(1),
});

const pipelineConfigurationUpdateSchema = pipelineConfigurationSchema.omit({ sourceId: true }).partial().strict().refine((value) => Object.keys(value).length > 0);

export class PipelineValidationError extends Error {
  constructor(message: string, readonly field?: "expression") { super(message); }
}

function defaults(type: z.infer<typeof actionSchema>["type"]) {
  const blocking = type === "transformation" || type === "callback" || type === "callback_boolean" || type === "email_confirmation";
  return { blocking, failurePolicy: blocking ? "cancel" as const : null };
}

function normalizedConfiguration(action: z.infer<typeof actionSchema>, previous?: Record<string, unknown>) {
  const configuration = action.configuration ?? {};
  if (action.type === "transformation") {
    const value = z.object({ expression: z.string().optional() }).safeParse(configuration);
    if (!value.success) throw new PipelineValidationError("Invalid JSONata transformation configuration", "expression");
    try { validateJsonataExpression(value.data.expression); }
    catch (error) { throw new PipelineValidationError((error as Error).message, "expression"); }
    return value.data;
  }
  if (action.type === "couchdb") {
    const raw = configuration && typeof configuration === "object" ? configuration as Record<string, unknown> : {};
    const value = couchDbConfigurationSchema.safeParse({ ...raw, password: raw.password || previous?.password });
    if (!value.success) throw new PipelineValidationError("CouchDB requires an HTTPS server URL, database, username and password");
    return value.data;
  }
  if (action.type === "webhook") {
    try { return normalizeWebhookConfiguration(configuration, previous); }
    catch { throw new PipelineValidationError("Webhook requires a valid HTTPS URL template and authentication configuration"); }
  }
  if (action.type === "callback") {
    const value = z.object({ timeoutSeconds: z.number().int().min(1).max(86_400), url: z.string().url() }).safeParse(configuration);
    if (!value.success) throw new PipelineValidationError("Callback configuration is required");
    return value.data;
  }
  if (action.type === "callback_boolean") {
    const value = z.object({ field: z.string().trim().min(1).max(120), timeoutSeconds: z.number().int().min(1).max(86_400), url: z.string().url() }).safeParse(configuration);
    if (!value.success) throw new PipelineValidationError("Callback Bool configuration is required");
    return value.data;
  }
  if (action.type === "email") {
    const value = z.object({ recipients: z.array(z.string().trim().min(3).max(320)).min(1), subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/).optional(), contentFormat: z.enum(["formatted", "json"]).optional() }).safeParse(configuration);
    if (!value.success) throw new PipelineValidationError("Email requires recipients, a non-empty single-line Subject and a valid Content format");
    return value.data;
  }
  if (action.type === "email_confirmation") {
    try {
      return normalizeEmailConfirmationConfiguration(configuration);
    } catch {
      throw new PipelineValidationError("Email Confirmation configuration is required");
    }
  }
  return configuration;
}

async function detail(database: Database, id: string, includeConfiguration: boolean) {
  const row = await database.select({ pipeline: pipelines, sourceName: sources.name, sourcePublicId: sources.sourceId })
    .from(pipelines).innerJoin(sources, eq(pipelines.sourceId, sources.id))
    .where(eq(pipelines.id, id)).get();
  if (!row) return null;
  const steps = await database.select().from(pipelineActions)
    .where(eq(pipelineActions.pipelineId, id)).orderBy(asc(pipelineActions.position)).all();
  const pipelineTags = await database.select({ color: tags.color, id: tags.id, name: tags.name }).from(sourceTags).innerJoin(tags, eq(sourceTags.tagId, tags.id)).where(eq(sourceTags.sourceId, row.pipeline.sourceId)).orderBy(asc(tags.name)).all();
  return {
    enabled: row.pipeline.enabled,
    id: row.pipeline.id,
    name: row.pipeline.name,
    sourceId: row.pipeline.sourceId,
    sourceName: row.sourceName,
    sourcePublicId: row.sourcePublicId,
    tags: pipelineTags,
    steps: steps.map((step) => {
      const stored = JSON.parse(step.configurationJson) as Record<string, unknown>;
      const configuration = step.type === "webhook"
        ? { ...stored, password: undefined, passwordConfigured: Boolean(stored.password), bearerToken: undefined, bearerTokenConfigured: Boolean(stored.bearerToken) }
        : step.type === "couchdb" ? { ...stored, password: undefined, passwordConfigured: Boolean(stored.password) } : stored;
      return includeConfiguration
        ? { ...step, configurationJson: undefined, condition: step.conditionJson ? JSON.parse(step.conditionJson) : null, configuration }
        : { enabled: step.enabled, id: step.id, name: step.name, position: step.position, type: step.type };
    }),
  };
}

export async function listPipelines(database: Database) {
  const rows = await database.select({ id: pipelines.id }).from(pipelines).orderBy(asc(pipelines.name)).all();
  return Promise.all(rows.map((row) => detail(database, row.id, false)));
}

export function getPipeline(database: Database, id: string) {
  return detail(database, id, true);
}

async function save(database: Database, value: unknown, existingId?: string) {
  const input = pipelineSchema.parse(value);
  const source = await database.select({ id: sources.id }).from(sources).where(eq(sources.id, input.sourceId)).get();
  if (!source) throw new Error("Data Source not found");
  const now = new Date();
  const id = existingId ?? createResourceId();
  const existing = existingId ? await database.select().from(pipelineActions).where(eq(pipelineActions.pipelineId, existingId)).all() : [];
  const previousById = new Map(existing.map((step) => [step.id, JSON.parse(step.configurationJson) as Record<string, unknown>]));
  database.transaction((transaction) => {
    if (existingId) {
      transaction.update(pipelines).set({ enabled: input.enabled ?? true, name: input.name, updatedAt: now }).where(eq(pipelines.id, id)).run();
      transaction.delete(pipelineActions).where(eq(pipelineActions.pipelineId, id)).run();
    } else transaction.insert(pipelines).values({ createdAt: now, enabled: input.enabled ?? true, id, name: input.name, sourceId: input.sourceId, updatedAt: now }).run();
    transaction.insert(pipelineActions).values(input.steps.map((action, index) => {
      const fallback = defaults(action.type);
      const blocking = action.type === "email_confirmation" ? true : action.blocking ?? fallback.blocking;
      return {
        blocking,
        conditionJson: action.condition ? JSON.stringify(action.condition) : null,
        conditionMissBehavior: action.conditionMissBehavior ?? "skip_action",
        configurationJson: JSON.stringify(normalizedConfiguration(action, action.id ? previousById.get(action.id) : undefined)),
        createdAt: now,
        pipelineId: id,
        enabled: action.enabled ?? true,
        failurePolicy: blocking ? action.failurePolicy ?? fallback.failurePolicy : null,
        id: action.id ?? createResourceId(),
        maximumAttempts: action.maximumAttempts ?? 3,
        name: action.name,
        position: index + 1,
        type: action.type,
        updatedAt: now,
      };
    })).run();
  });
  return detail(database, id, true);
}

export function createPipeline(database: Database, value: unknown) { return save(database, value); }
export async function updatePipeline(database: Database, id: string, value: unknown) {
  const input = pipelineSchema.parse(value);
  const current = await database.select({ id: pipelines.id, sourceId: pipelines.sourceId }).from(pipelines).where(eq(pipelines.id, id)).get();
  if (current && current.sourceId !== input.sourceId) throw new PipelineValidationError("An existing Pipeline cannot change its Data Source");
  return current ? save(database, input, id) : null;
}

async function existingPipeline(database: Database, id: string) {
  return database.select({ id: pipelines.id, sourceId: pipelines.sourceId })
    .from(pipelines).where(eq(pipelines.id, id)).get();
}

function persistedActionValues(
  action: z.infer<typeof actionSchema>,
  position: number,
  now: Date,
  pipelineId: string,
  previous?: Record<string, unknown>,
) {
  const fallback = defaults(action.type);
  const blocking = action.type === "email_confirmation" ? true : action.blocking ?? fallback.blocking;
  return {
    blocking,
    conditionJson: action.condition ? JSON.stringify(action.condition) : null,
    conditionMissBehavior: action.conditionMissBehavior ?? "skip_action" as const,
    configurationJson: JSON.stringify(normalizedConfiguration(action, previous)),
    createdAt: now,
    pipelineId,
    enabled: action.enabled ?? true,
    failurePolicy: blocking ? action.failurePolicy ?? fallback.failurePolicy : null,
    id: action.id ?? createResourceId(),
    maximumAttempts: action.maximumAttempts ?? 3,
    name: action.name,
    position,
    type: action.type,
    updatedAt: now,
  };
}

export async function createPipelineConfiguration(database: Database, value: unknown) {
  const input = pipelineConfigurationSchema.parse(value);
  const source = await database.select({ id: sources.id }).from(sources).where(eq(sources.id, input.sourceId)).get();
  if (!source) throw new Error("Data Source not found");
  const now = new Date();
  const id = createResourceId();
  database.insert(pipelines).values({
    createdAt: now,
    enabled: input.enabled ?? true,
    id,
    name: input.name,
    sourceId: input.sourceId,
    updatedAt: now,
  }).run();
  return detail(database, id, true);
}

export async function updatePipelineConfiguration(database: Database, id: string, value: unknown) {
  const input = pipelineConfigurationUpdateSchema.parse(value);
  const pipeline = await existingPipeline(database, id);
  if (!pipeline) return null;
  database.update(pipelines).set({ enabled: input.enabled, name: input.name, updatedAt: new Date() })
    .where(eq(pipelines.id, id)).run();
  return detail(database, id, true);
}

export async function createPipelineAction(database: Database, pipelineId: string, value: unknown) {
  const action = actionSchema.parse(value);
  if (!(await existingPipeline(database, pipelineId))) return null;
  const now = new Date();
  const actionId = createResourceId();
  database.transaction((transaction) => {
    const position = transaction.select({ position: pipelineActions.position }).from(pipelineActions)
      .where(eq(pipelineActions.pipelineId, pipelineId)).orderBy(asc(pipelineActions.position)).all().length + 1;
    transaction.insert(pipelineActions).values(persistedActionValues({ ...action, id: actionId }, position, now, pipelineId)).run();
  });
  return detail(database, pipelineId, true);
}

export async function updatePipelineAction(database: Database, pipelineId: string, actionId: string, value: unknown) {
  const action = actionSchema.parse(value);
  const existing = await database.select().from(pipelineActions).where(eq(pipelineActions.id, actionId)).get();
  if (!existing || existing.pipelineId !== pipelineId) return null;
  const now = new Date();
  database.update(pipelineActions).set({
    ...persistedActionValues({ ...action, id: actionId }, existing.position, now, pipelineId, JSON.parse(existing.configurationJson)),
    createdAt: existing.createdAt,
  }).where(eq(pipelineActions.id, actionId)).run();
  return detail(database, pipelineId, true);
}

export async function deletePipelineAction(database: Database, pipelineId: string, actionId: string) {
  const existing = await database.select().from(pipelineActions).where(eq(pipelineActions.id, actionId)).get();
  if (!existing || existing.pipelineId !== pipelineId) return null;
  database.transaction((transaction) => {
    transaction.delete(pipelineActions).where(eq(pipelineActions.id, actionId)).run();
    const later = transaction.select().from(pipelineActions).where(
      gt(pipelineActions.position, existing.position),
    ).all().filter((action) => action.pipelineId === pipelineId);
    for (const action of later) {
      transaction.update(pipelineActions).set({ position: action.position - 1, updatedAt: new Date() }).where(eq(pipelineActions.id, action.id)).run();
    }
  });
  return detail(database, pipelineId, true);
}

export async function movePipelineAction(database: Database, pipelineId: string, actionId: string, direction: "down" | "up") {
  const actions = await database.select().from(pipelineActions).where(eq(pipelineActions.pipelineId, pipelineId)).orderBy(asc(pipelineActions.position)).all();
  const index = actions.findIndex((action) => action.id === actionId);
  const target = index + (direction === "up" ? -1 : 1);
  if (index < 0) return null;
  if (target < 0 || target >= actions.length) return detail(database, pipelineId, true);
  const current = actions[index]!;
  const adjacent = actions[target]!;
  const now = new Date();
  database.transaction((transaction) => {
    transaction.update(pipelineActions).set({ position: 0, updatedAt: now }).where(eq(pipelineActions.id, current.id)).run();
    transaction.update(pipelineActions).set({ position: current.position, updatedAt: now }).where(eq(pipelineActions.id, adjacent.id)).run();
    transaction.update(pipelineActions).set({ position: adjacent.position, updatedAt: now }).where(eq(pipelineActions.id, current.id)).run();
  });
  return detail(database, pipelineId, true);
}

export type DeletePipelineResult = "deleted" | "not_found" | "enabled" | "active_runs";

// Deletion keeps completed Pipeline Runs as history: their pipeline link is set
// to null by the schema, while Action definitions are removed with the Pipeline.
export async function deletePipeline(database: Database, id: string): Promise<DeletePipelineResult> {
  const pipeline = await database.select({ enabled: pipelines.enabled }).from(pipelines).where(eq(pipelines.id, id)).get();
  if (!pipeline) return "not_found";
  if (pipeline.enabled) return "enabled";
  const activeRun = await database.select({ id: pipelineRuns.id }).from(pipelineRuns)
    .where(and(eq(pipelineRuns.pipelineId, id), inArray(pipelineRuns.status, ["pending", "processing"]))).get();
  if (activeRun) return "active_runs";
  database.delete(pipelines).where(eq(pipelines.id, id)).run();
  return "deleted";
}
