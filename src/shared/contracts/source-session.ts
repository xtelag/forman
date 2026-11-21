import { z } from "zod";
import { submissionPayloadSchema, type SubmissionPayload } from "./submission";

export const sessionSettingsSchema = z.object({
  enabled: z.boolean(),
  inactivityDays: z.number().int().min(1).max(365),
  completedRetentionDays: z.number().int().min(1).max(365),
}).strict();
export type SessionSettings = z.infer<typeof sessionSettingsSchema>;
export const defaultSessionSettings: SessionSettings = { enabled: false, inactivityDays: 30, completedRetentionDays: 30 };
export const sessionOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("open"), protection: z.object({ altcha: z.string().max(16384).optional(), honeypot: z.record(z.string(), z.string().max(1000)).refine(value => Object.keys(value).length <= 10).optional() }).strict().optional() }).strict(),
  z.object({ operation: z.literal("read") }).strict(),
  z.object({ operation: z.literal("update"), operationId: z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), final: z.boolean().optional(), currentPage: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(), payload: submissionPayloadSchema }).strict(),
]);
// sessionId is a secret identifier, sent only in the request envelope.
export type SessionRequest = z.infer<typeof sessionOperationSchema> & { sessionId: string };
export type SessionMetadata = { sessionRequestCount: number; sessionUpdateCount: number };
export type PublicSourceSession = {
  status: "draft" | "completed";
  payload: SubmissionPayload;
  revision: number;
  meta: SessionMetadata & { currentPage: number };
  expiresAt: string;
  submissionId: string | null;
  duplicate?: boolean;
};
export type AdminSourceSession = {
  id: string; status: "draft" | "completed" | "expired"; revision: number;
  meta: SessionMetadata & { currentPage: number }; createdAt: string; updatedAt: string; expiresAt: string;
  submissionId: string | null;
};
export type AdminSourceSessions = { settings: SessionSettings; items: AdminSourceSession[]; total: number; page: number; size: 10 | 50 | 100 };
