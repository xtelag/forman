import { z } from "zod";

const storedSubmissionScalarSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
export const storedSubmissionValueSchema = z.union([
  storedSubmissionScalarSchema,
  z.array(storedSubmissionScalarSchema).min(1),
]);

export const submissionPayloadSchema = z.record(z.string(), storedSubmissionValueSchema);

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export const storedSubmissionPayloadSchema = z.record(z.string(), storedSubmissionValueSchema);

export type StoredSubmissionPayload = z.infer<typeof storedSubmissionPayloadSchema>;

export function parseStoredSubmissionPayload(value: string): StoredSubmissionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Stored submission payload is not valid JSON");
  }

  const result = storedSubmissionPayloadSchema.safeParse(parsed);
  if (!result.success) throw new Error("Stored submission payload has an invalid shape");
  return result.data;
}
