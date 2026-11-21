import { asc, eq } from "drizzle-orm";

import type { createDatabase } from "@/server/db/client";
import {
  pipelineRuns,
  pipelineActionRuns,
  pipelines,
  pipelineActions,
} from "@/server/db/schema";
import { createResourceId } from "@/server/ids/resource-id";
import type { SubmissionPayload } from "@/shared/contracts/submission";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type PipelineWriteDatabase = Pick<FormanDatabase, "insert">;

export type PreparedPipelineRun = {
  pipeline: {
    pipelineId: string;
    pipelineName: string;
    id: string;
    snapshotJson: string;
    sourceId: string;
  };
  actions: Array<{
    actionId: string;
    blocking: boolean;
    conditionJson: string | null;
    conditionMissBehavior: "skip_action" | "skip_remaining";
    configurationJson: string;
    failurePolicy: "bypass" | "cancel" | null;
    id: string;
    maximumAttempts: number;
    name: string;
    position: number;
    type: "transformation" | "webhook" | "callback" | "callback_boolean" | "email" | "email_confirmation" | "inbox" | "couchdb";
  }>;
  createdAt: Date;
  payloadJson: string;
};

export function preparePipelineRunsSync(
  database: Pick<FormanDatabase, "select">,
  {
    createdAt,
    payload,
    sourceId,
  }: {
    createdAt: Date;
    payload: SubmissionPayload;
    sourceId: string;
  },
): PreparedPipelineRun[] {
  const [pipelineRecords, actionRecords] = [
    database
      .select()
      .from(pipelines)
      .where(eq(pipelines.sourceId, sourceId))
      .orderBy(asc(pipelines.name))
      .all(),
    database
      .select()
      .from(pipelineActions)
      .orderBy(asc(pipelineActions.position))
      .all(),
  ];
  const payloadJson = JSON.stringify(payload);

  return pipelineRecords
    .filter((pipeline) => pipeline.enabled)
    .map((pipeline) => {
      const actions = actionRecords
        .filter(
          (action) => action.pipelineId === pipeline.id && action.enabled,
        )
        .map((action) => ({
          actionId: action.id,
          blocking: action.blocking,
          conditionJson: action.conditionJson,
          conditionMissBehavior: action.conditionMissBehavior,
          configurationJson: action.configurationJson,
          failurePolicy: action.failurePolicy,
          id: createResourceId(),
          maximumAttempts: action.maximumAttempts,
          name: action.name,
          position: action.position,
          type: action.type,
        }));
      return {
        actions,
        createdAt,
        pipeline: {
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          id: createResourceId(),
          snapshotJson: JSON.stringify({
            actions: actions.map((action) => ({
              actionId: action.actionId,
              blocking: action.blocking,
              conditionJson: action.conditionJson,
              conditionMissBehavior: action.conditionMissBehavior,
              configurationJson: action.configurationJson,
              failurePolicy: action.failurePolicy,
              maximumAttempts: action.maximumAttempts,
              name: action.name,
              position: action.position,
              type: action.type,
            })),
            pipeline: { id: pipeline.id, name: pipeline.name },
          }),
          sourceId: pipeline.sourceId,
        },
        payloadJson,
      };
    })
    .filter((prepared) => prepared.actions.length > 0);
}

export function insertPreparedPipelineRuns(
  database: PipelineWriteDatabase,
  submissionId: string,
  preparedRuns: readonly PreparedPipelineRun[],
) {
  for (const prepared of preparedRuns) {
    database.insert(pipelineRuns).values({
      createdAt: prepared.createdAt,
      pipelineId: prepared.pipeline.pipelineId,
      pipelineName: prepared.pipeline.pipelineName,
      id: prepared.pipeline.id,
      snapshotJson: prepared.pipeline.snapshotJson,
      sourceId: prepared.pipeline.sourceId,
      status: "pending",
      submissionId,
      updatedAt: prepared.createdAt,
    }).run();
    if (prepared.actions.length > 0) {
      database.insert(pipelineActionRuns).values(
        prepared.actions.map((action, index) => ({
          actionId: action.actionId,
          attemptCount: 0,
          blocking: action.blocking,
          conditionJson: action.conditionJson,
          conditionMissBehavior: action.conditionMissBehavior,
          configurationJson: action.configurationJson,
          createdAt: prepared.createdAt,
          errorSummary: null,
          failurePolicy: action.failurePolicy,
          id: action.id,
          inputPayloadJson: prepared.payloadJson,
          maximumAttempts: action.maximumAttempts,
          name: action.name,
          nextAttemptAt: index === 0 ? prepared.createdAt : null,
          outputPayloadJson: null,
          position: action.position,
          runId: prepared.pipeline.id,
          status: index === 0 ? "pending" as const : "not_run" as const,
          type: action.type,
          updatedAt: prepared.createdAt,
        })),
      ).run();
    }
  }
}

// Public async API retained for intake callers; synchronous variant composes
// with atomic setup transactions.
export async function preparePipelineRuns(
  database: FormanDatabase,
  input: Parameters<typeof preparePipelineRunsSync>[1],
): Promise<PreparedPipelineRun[]> {
  return preparePipelineRunsSync(database, input);
}
