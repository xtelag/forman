import type { createDatabase } from "@/server/db/client";
import { createResourceId } from "@/server/ids/resource-id";
import { submissions } from "@/server/db/schema";
import {
  insertPreparedPipelineRuns,
  preparePipelineRuns,
} from "@/server/pipelines/pipeline-run-service";
import { findActiveSourceBySourceId } from "@/server/sources/source-service";
import { compileSourceFields } from "@/server/sources/source-fields";
import { verifyServerSubmissionToken } from "@/server/sources/server-token-service";
import { submissionPayloadSchema } from "@/shared/contracts/submission";
import {
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/server/http/bounded-request-body";

import { validateSubmissionLimits } from "./browser-submission-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type ServerSubmissionOptions = {
  afterAuthentication?: () => Response | null;
};

function bearerToken(header: string | null) {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}

export async function handleServerSubmission(
  database: FormanDatabase,
  sourceId: string,
  request: Request,
  { afterAuthentication }: ServerSubmissionOptions = {},
) {
  const form = await findActiveSourceBySourceId(database, sourceId);
  if (!form || form.type !== "m2m")
    return Response.json({ error: "Source unavailable" }, { status: 503 });

  const token = bearerToken(request.headers.get("authorization"));
  if (
    !token ||
    !(await verifyServerSubmissionToken(database, form.id, token))
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = afterAuthentication?.();
  if (limited) return limited;

  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return Response.json(
      { error: "Unsupported content type" },
      { status: 415 },
    );
  }

  let body: string;
  try {
    body = await readBoundedRequestText(request, form.maxBodyBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return Response.json({ error: "Payload too large" }, { status: 413 });
    throw error;
  }

  const parsed = submissionPayloadSchema.safeParse(
    (() => {
      try {
        return JSON.parse(body);
      } catch {
        return undefined;
      }
    })(),
  );
  const payload = parsed.success && form.fieldDefinitionMode && form.fieldDefinitionSource
    ? compileSourceFields(form.fieldDefinitionMode, form.fieldDefinitionSource).parse(parsed.data)
    : parsed.success ? parsed.data : null;
  if (!payload || !validateSubmissionLimits(payload, form)) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const submissionId = createResourceId();
  const createdAt = new Date();
  const preparedPipelineRuns = await preparePipelineRuns(database, {
    createdAt,
    payload,
    sourceId: form.id,
  });
  database.transaction((transaction) => {
    transaction
      .insert(submissions)
      .values({
        createdAt,
        sourceId: form.id,
        id: submissionId,
        payloadJson: JSON.stringify(payload),
      })
      .run();
    insertPreparedPipelineRuns(
      transaction,
      submissionId,
      preparedPipelineRuns,
    );
  });
  return Response.json({ success: true, submissionId }, { status: 202 });
}
