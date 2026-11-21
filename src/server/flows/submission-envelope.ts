import type { SubmissionPayload } from "@/shared/contracts/submission";

type SubmissionEnvelopeInput = {
  client?: { ip?: string | null; referer?: string | null; userAgent?: string | null };
  date: Date;
  form: { sourceId: string; name: string };
  payload: SubmissionPayload;
  source: "browser" | "m2m" | "popup";
  submissionId: string;
};

export function createSubmissionEnvelope({ client, date, form, payload, source, submissionId }: SubmissionEnvelopeInput) {
  const clientMeta = Object.fromEntries(Object.entries(client ?? {}).filter(([, value]) => typeof value === "string" && value.length > 0));
  return {
    date: date.toISOString(),
    meta: {
      ...(Object.keys(clientMeta).length > 0 ? { client: clientMeta } : {}),
      sourceId: form.sourceId,
      sourceName: form.name,
      source,
      submissionId,
    },
    payload,
  };
}
