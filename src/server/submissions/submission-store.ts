import type { createDatabase } from "@/server/db/client";
import { createResourceId } from "@/server/ids/resource-id";
import { consumedChallenges, submissions } from "@/server/db/schema";
import {
  insertPreparedPipelineRuns,
  type PreparedPipelineRun,
} from "@/server/pipelines/pipeline-run-service";
import type { SubmissionPayload } from "@/shared/contracts/submission";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type StoreSubmissionInput = {
  createdAt?: Date;
  clientIp?: string | null;
  challengeExpiresAt: Date;
  challengeId: string;
  sourceId: string;
  payload: SubmissionPayload;
  preparedPipelineRuns: readonly PreparedPipelineRun[];
  submissionId?: string;
  referer?: string | null;
  userAgent?: string | null;
};

type StoreBrowserSubmissionInput = Omit<
  StoreSubmissionInput,
  "challengeExpiresAt" | "challengeId"
>;

export async function storeBrowserSubmission(
  database: FormanDatabase,
  {
    clientIp,
    createdAt = new Date(),
    sourceId,
    payload,
    preparedPipelineRuns,
    referer,
    submissionId = createResourceId(),
    userAgent,
  }: StoreBrowserSubmissionInput,
) {
  database.transaction((transaction) => {
    transaction
      .insert(submissions)
      .values({
        clientIp,
        createdAt,
        sourceId,
        id: submissionId,
        payloadJson: JSON.stringify(payload),
        referer,
        userAgent,
      })
      .run();
    insertPreparedPipelineRuns(
      transaction,
      submissionId,
      preparedPipelineRuns,
    );
  });
}

export async function storeVerifiedBrowserSubmission(
  database: FormanDatabase,
  {
    challengeExpiresAt,
    challengeId,
    clientIp,
    createdAt = new Date(),
    sourceId,
    payload,
    preparedPipelineRuns,
    referer,
    submissionId = createResourceId(),
    userAgent,
  }: StoreSubmissionInput,
) {
  return database.transaction((transaction) => {
    const consumption = transaction
      .insert(consumedChallenges)
      .values({
        challengeId,
        consumedAt: new Date(),
        expiresAt: challengeExpiresAt,
        sourceId,
      })
      .onConflictDoNothing()
      .run();

    if (consumption.changes !== 1) {
      return false;
    }

    transaction
      .insert(submissions)
      .values({
        clientIp,
        createdAt,
        sourceId,
        id: submissionId,
        payloadJson: JSON.stringify(payload),
        referer,
        userAgent,
      })
      .run();
    insertPreparedPipelineRuns(
      transaction,
      submissionId,
      preparedPipelineRuns,
    );

    return true;
  });
}
