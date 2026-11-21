import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { createDatabase } from "@/server/db/client";
import {
  sources,
  pages,
  pipelines,
  pipelineActions,
  pipelineRuns,
  submissions,
  sourceSessions,
} from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import { sourceConfigurationDocumentSchema } from "@/server/sources/source-configuration-document";
import { compileSourceFields } from "@/server/sources/source-fields";
import {
  preparePipelineRunsSync,
  insertPreparedPipelineRuns,
} from "@/server/pipelines/pipeline-run-service";
import { runPipeline } from "@/server/pipelines/pipeline-run-worker";
import { sessionKeyHash } from "@/server/source-sessions/session-service";
import { sourceFieldTemplates } from "@/shared/source-field-templates";
import { pagePresentationSchema } from "@/shared/contracts/page";
import {
  exampleInputSchema,
  type ExampleInput,
  type ExampleResult,
  type ExampleResponse,
} from "@/shared/contracts/examples";

type Database = ReturnType<typeof createDatabase>["db"];

export function createExample(
  database: Database,
  input: ExampleInput,
): ExampleResult {
  const { kind, requestId } = exampleInputSchema.parse(input);
  return database.transaction(
    (tx) => {
      // The operation UUID is the Source identity: retrying an interrupted response
      // cannot create another graph or seed another Submission.
      const existing = tx
        .select()
        .from(sources)
        .where(eq(sources.id, requestId))
        .get();
      if (existing) {
        if (existing.type !== (kind === "survey" ? "session" : "one-shot"))
          throw new Error("Example request already used");
        const page = tx
          .select()
          .from(pages)
          .where(eq(pages.sourceId, requestId))
          .get();
        const run = tx
          .select()
          .from(pipelineRuns)
          .where(eq(pipelineRuns.sourceId, requestId))
          .get();
        if (!page || !run) throw new Error("Example is no longer available");
        return {
          kind,
          name: existing.name,
          sourceId: requestId,
          pageId: page.pageId,
          submissionId: run.submissionId,
          runId: run.id,
        };
      }
      const base = kind === "form" ? "Example Form" : "Example Survey";
      const names = new Set(
        tx
          .select({ name: sources.name })
          .from(sources)
          .all()
          .map((row) => row.name.trim().toLowerCase()),
      );
      let number = 1;
      while (names.has((base + " " + number).toLowerCase())) number++;
      const name = base + " " + number;
      const now = new Date();
      const sourceId = requestId;
      const pipelineId = createResourceId();
      const pageId = createResourceId();
      const submissionId = createResourceId();
      const survey = kind === "survey";
      const definition = JSON.stringify(
        survey
          ? sourceFieldTemplates.survey
          : sourceFieldTemplates["name-email-organization-note"],
      );
      const configuration = sourceConfigurationDocumentSchema.parse({
        altchaEnabled: true,
        fieldDefinitionMode: "json-schema",
        fieldDefinitionSource: definition,
      });
      const payload = compileSourceFields("json-schema", definition).parse(
        survey
          ? {
              name: "Alex Example",
              rating: 5,
              comment: "This is a sample survey response.",
            }
          : {
              name: "Alex Example",
              email: "alex@example.com",
              organization: "Example organization",
              note: "This is a sample form response.",
            },
      );
      if (!payload) throw new Error("Invalid example response");
      const fields = survey
        ? [
            { name: "name", step: 1 },
            { name: "rating", step: 2 },
            { name: "comment", step: 2, textControl: "textarea" },
          ]
        : [
            { name: "name" },
            { name: "email" },
            { name: "organization" },
            { name: "note", textControl: "textarea" },
          ];
      const presentation = pagePresentationSchema.parse({
        title: name,
        description: survey
          ? "Try this two-step survey. Your answers are saved as you go."
          : "Try this contact form. Your response will appear in Inbox.",
        ...(survey
          ? {
              steps: [
                { id: 1, title: "About you" },
                { id: 2, title: "Your feedback" },
              ],
            }
          : {}),
        fields: fields.map((field, order) => ({ ...field, order })),
      });
      tx.insert(sources)
        .values({
          id: sourceId,
          sourceId: createResourceId(),
          name,
          type: survey ? "session" : "one-shot",
          configuration,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(pipelines)
        .values({
          id: pipelineId,
          sourceId,
          name,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(pipelineActions)
        .values({
          id: createResourceId(),
          pipelineId,
          name: "Inbox",
          type: "inbox",
          position: 1,
          configurationJson: "{}",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(pages)
        .values({
          id: createResourceId(),
          pageId,
          sourceId,
          name,
          enabled: true,
          presentationJson: JSON.stringify(presentation),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const prepared = preparePipelineRunsSync(tx, {
        sourceId,
        payload,
        createdAt: now,
      });
      const meta = survey
        ? { sessionUpdateCount: 1, sessionRequestCount: 2 }
        : {};
      tx.insert(submissions)
        .values({
          id: submissionId,
          sourceId,
          payloadJson: JSON.stringify(payload),
          createdAt: now,
          ...meta,
        })
        .run();
      if (survey) {
        // A synthetic completed session, not a browser request or CAPTCHA bypass.
        tx.insert(sourceSessions)
          .values({
            id: createResourceId(),
            sourceId,
            keyHash: sessionKeyHash(randomUUID()),
            status: "completed",
            currentPage: 2,
            revision: 1,
            updateCount: 1,
            requestCount: 2,
            submissionId,
            payloadJson: JSON.stringify(payload),
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(
              now.getTime() +
                configuration.session.completedRetentionDays * 86400000,
            ),
          })
          .run();
        for (const run of prepared)
          run.pipeline.snapshotJson = JSON.stringify({
            ...JSON.parse(run.pipeline.snapshotJson),
            meta,
          });
      }
      insertPreparedPipelineRuns(tx, submissionId, prepared);
      return {
        kind,
        name,
        sourceId,
        pageId,
        submissionId,
        runId: prepared[0]!.pipeline.id,
      };
    },
    { behavior: "immediate" },
  );
}

export async function processExample(
  database: Database,
  example: ExampleResult,
): Promise<ExampleResponse["sampleStatus"]> {
  try {
    await runPipeline({ database, runId: example.runId });
  } catch {
    /* The complete example is retained; report processing separately. */
  }
  const run = database
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, example.runId))
    .get();
  return run?.status === "completed"
    ? "completed"
    : run?.status === "pending" || run?.status === "processing"
      ? "pending"
      : "failed";
}
