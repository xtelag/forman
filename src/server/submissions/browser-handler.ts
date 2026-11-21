import { extractParams } from "altcha-lib/v1";
import type { Payload } from "altcha-lib/v1/types";

import { verifyAltchaChallenge } from "@/server/anti-abuse/altcha";
import type { Environment } from "@/server/config/environment";
import type { createDatabase } from "@/server/db/client";
import {
  findActiveSourceBySourceId,
  normalizeSourceId,
} from "@/server/sources/source-service";
import { preparePipelineRuns } from "@/server/pipelines/pipeline-run-service";
import { getTrustedClientIp } from "@/server/anti-abuse/client-ip";
import { compileSourceFields } from "@/server/sources/source-fields";
import { findPageByPublicId } from "@/server/pages/page-service";
import { createResourceId } from "@/server/ids/resource-id";
import {
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/server/http/bounded-request-body";

import { decodeAltchaPayload } from "./altcha-payload";
import {
  parseBrowserSubmission,
  VerificationFailedError,
  InvalidBrowserSubmissionError,
  UnsupportedBrowserSubmissionContentTypeError,
  validateSubmissionLimits,
} from "./browser-submission-service";
import { browserSuccessResponse } from "./browser-success-response";
import { browserErrorResponse } from "./browser-error-response";
import {
  storeBrowserSubmission,
  storeVerifiedBrowserSubmission,
} from "./submission-store";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type Dependencies = { database: FormanDatabase; environment: Environment };
type AltchaPayload = Payload;

export async function handleBrowserSubmission(
  { database, environment }: Dependencies,
  sourceId: string,
  request: Request,
) {
  const normalizedSourceId = normalizeSourceId(sourceId);
  const form = await findActiveSourceBySourceId(database, normalizedSourceId);
  if (!form || form.type !== "one-shot")
    return browserErrorResponse(request, { baseUrl: environment.baseOrigin.toString(), sourceId: normalizedSourceId, kind: "unavailable" });
  const requestedPageId = new URL(request.url).searchParams.get("page");
  const requestedPage = requestedPageId ? await findPageByPublicId(database, requestedPageId) : null;
  const returnPageId = requestedPage?.sourceId === form.id ? requestedPage.pageId : null;
  const verificationFailed = () => Response.json({ error: "Verification failed" }, { status: 403 });
  const genericSuccess = () =>
    browserSuccessResponse(
      request,
      {
        baseUrl: environment.baseOrigin.toString(),
        sourceId: normalizedSourceId,
        pageId: returnPageId,
        sessionSecret: environment.sessionSecret,
        successUrl: form.successUrl,
      },
    );

  let text: string;
  try {
    text = await readBoundedRequestText(request, form.maxBodyBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return Response.json({ error: "Payload too large" }, { status: 413 });
    throw error;
  }

  let parsed;
  try {
    parsed = parseBrowserSubmission(
      request.headers.get("content-type"),
      text,
      form,
    );
  } catch (error) {
    if (error instanceof UnsupportedBrowserSubmissionContentTypeError) {
      return Response.json(
        { error: "Unsupported content type" },
        { status: 415 },
      );
    }
    if (error instanceof InvalidBrowserSubmissionError)
      return browserErrorResponse(request, { baseUrl: environment.baseOrigin.toString(), sourceId: normalizedSourceId, kind: "invalid" });
    if (error instanceof VerificationFailedError) return verificationFailed();
    throw error;
  }

  const payload = form.fieldDefinitionMode && form.fieldDefinitionSource
    ? compileSourceFields(form.fieldDefinitionMode, form.fieldDefinitionSource).parse(parsed.payload)
    : parsed.payload;
  if (!payload || !validateSubmissionLimits(parsed.limitPayload, form) || !validateSubmissionLimits(payload, form))
    return browserErrorResponse(request, { baseUrl: environment.baseOrigin.toString(), sourceId: normalizedSourceId, kind: "invalid" });

  const submission = {
    createdAt: new Date(),
    sourceId: form.id,
    payload,
    referer: form.storeReferer ? request.headers.get("referer") : null,
    userAgent: form.storeUserAgent ? request.headers.get("user-agent") : null,
    submissionId: createResourceId(),
  };

  const clientIp = getTrustedClientIp(request.headers, environment.trustProxy);
  const preparedPipelineRuns = await preparePipelineRuns(database, {
    createdAt: submission.createdAt,
    payload: submission.payload,
    sourceId: form.id,
  });

  if (!parsed.altchaPayload) {
    await storeBrowserSubmission(database, {
      ...submission,
      clientIp,
      preparedPipelineRuns,
    });
    return genericSuccess();
  }

  let proof: AltchaPayload;
  try {
    proof = decodeAltchaPayload(parsed.altchaPayload) as AltchaPayload;
    const verified = await verifyAltchaChallenge({
      sourceId: normalizedSourceId,
      payload: proof,
      secret: environment.altchaSecret,
    });
    if (!verified) return verificationFailed();
  } catch {
    return verificationFailed();
  }
  const parameters = extractParams(proof);

    const stored = await storeVerifiedBrowserSubmission(database, {
      challengeExpiresAt: new Date(
        Number(parameters.expires ?? parameters.expire ?? 0) * 1000,
      ),
      challengeId: proof.signature,
      clientIp,
      preparedPipelineRuns,
      ...submission,
    });
  return stored ? genericSuccess() : verificationFailed();
}
