import { sessionSettings } from "../source-sessions/session-service";
import { integrationFields } from "./integration-fields";
import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { pages, pipelines, pipelineActions } from "@/server/db/schema";
import { asc, count, eq } from "drizzle-orm";
import type { AdminSourceDetail, AdminSourceDetailResponse } from "@/shared/contracts/admin";

import { findSourceBySourceId } from "./source-service";
import { createBrowserHtmlSnippet, createBrowserJavaScriptSnippet, createMachineToMachineSnippet, createPopupSourceSnippet, createReactJsxSnippet } from "./integration-snippets";
import { getServerSubmissionTokenPrefix, issueServerSubmissionToken } from "./server-token-service";
import { countSubmissionsForSource, getObservedFieldNames } from "../submissions/query-service";
import { listTagsForSource } from "../tags/tag-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function unauthorized() { return Response.json({ error: "Unauthorized" }, { status: 401 }); }

function toAdminSourceDetail(source: NonNullable<Awaited<ReturnType<typeof findSourceBySourceId>>>, serverTokenPrefix: string | null, tags: AdminSourceDetail["tags"]): AdminSourceDetail {
  return { type: source.type, allowedOrigins: source.allowedOrigins, altchaEnabled: source.altchaEnabled, challengeRateLimitPerMinute: source.challengeRateLimitPerMinute, createdAt: source.createdAt.toISOString(), enabled: source.enabled, fieldDefinitionMode: source.fieldDefinitionMode, fieldDefinitionSource: source.fieldDefinitionSource, sourceId: source.sourceId, honeypotEnabled: source.honeypotEnabled, honeypotFieldNames: source.honeypotFieldNames, id: source.id, maxBodyBytes: source.maxBodyBytes, maxEntries: source.maxEntries, maxKeyLength: source.maxKeyLength, maxUniqueKeys: source.maxUniqueKeys, maxValueLength: source.maxValueLength, maxValuesPerKey: source.maxValuesPerKey, name: source.name, retentionDays: source.retentionDays, serverTokenPrefix, storeReferer: source.storeReferer, storeUserAgent: source.storeUserAgent, submissionRateLimitPerMinute: source.submissionRateLimitPerMinute, successUrl: source.successUrl, tags, updatedAt: source.updatedAt.toISOString() };
}

export function createAdminSourceDetailHandler({ baseUrl, database }: { baseUrl: URL; database: FormanDatabase }) {
  return { async get(request: Request, publicSourceId: string) {
    if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) return unauthorized();
    const source = await findSourceBySourceId(database, publicSourceId);
    if (!source) return Response.json({ error: "Not found" }, { status: 404 });
    const [pipelineRecords, actionRecords, observedFieldNames, submissionCount, storedServerTokenPrefix, tags] = await Promise.all([database.select().from(pipelines).where(eq(pipelines.sourceId, source.id)).orderBy(asc(pipelines.name)).all(), database.select().from(pipelineActions).orderBy(asc(pipelineActions.position)).all(), getObservedFieldNames(database, source.id), countSubmissionsForSource(database, source.id), getServerSubmissionTokenPrefix(database, source.id), listTagsForSource(database, source.id)]);
    const serverTokenPrefix = source.type === "m2m" ? storedServerTokenPrefix ?? (await issueServerSubmissionToken(database, source.id)).prefix : null;
    const submissionUrl = new URL(`/api/submit/${source.sourceId}`, baseUrl).toString();
    const challengeUrl = new URL(`/api/challenge/${source.sourceId}`, baseUrl).toString();
    const popupScriptUrl = new URL("/public/pop-up-v1.js", baseUrl).toString();
    const examplesAvailable = Boolean(source.fieldDefinitionSource?.trim());
    const {fields,payload,warnings} = examplesAvailable ? integrationFields(source.fieldDefinitionSource) : {fields: [], payload: {}, warnings: []};
    const sessionEnabled = source.type === "session";
    const options = {challengeUrl,submissionUrl,fields,protections:{altchaEnabled:source.altchaEnabled,honeypotEnabled:source.honeypotEnabled,honeypotFieldNames:source.honeypotFieldNames}};
    const response: AdminSourceDetailResponse = { pageCount: database.select({ value: count() }).from(pages).where(eq(pages.sourceId, source.id)).get()!.value, pipelines: pipelineRecords.map((pipeline) => ({ enabled: pipeline.enabled, id: pipeline.id, name: pipeline.name, steps: actionRecords.filter((action) => action.pipelineId === pipeline.id).map((action) => ({ enabled: action.enabled })) })), source: toAdminSourceDetail(source, serverTokenPrefix, tags), observedFieldNames, submissionCount, sessionSettings: sessionSettings(database, source.id), integration: {
      sourceType: source.type, examplesAvailable, endpoints: {submission: submissionUrl, challenge: source.type === "m2m" ? null : challengeUrl}, warnings,
      sessionJavaScript: examplesAvailable && sessionEnabled ? createBrowserJavaScriptSnippet(options,true) : null,
      sessionReactJsx: examplesAvailable && sessionEnabled ? createReactJsxSnippet(options,true) : null,
      browserHtml: examplesAvailable && source.type === "one-shot" ? createBrowserHtmlSnippet(options) : "",
      browserJavaScript: examplesAvailable && source.type === "one-shot" ? createBrowserJavaScriptSnippet(options) : "",
      reactJsx: examplesAvailable && source.type === "one-shot" ? createReactJsxSnippet(options) : "",
      m2mCurl: examplesAvailable && source.type === "m2m" ? createMachineToMachineSnippet(submissionUrl,process.env.NODE_ENV === "production",payload) : "",
      popupSource: examplesAvailable && source.type === "one-shot" ? createPopupSourceSnippet({sourceId:source.sourceId,sourceName:source.name,popupScriptUrl,fields}) : "",
    } };
    return Response.json(response);
  } };
}
