export const webhookErrorSummaries = {
  connection: "Webhook connection failed. Check the destination and network.",
  http: "Webhook returned a non-success HTTP status.",
  json: "Webhook response is not valid JSON.",
  shape: "Webhook response must be a flat JSON object.",
} as const;

// Only these application-owned messages may enter the administrator audit.
export class WebhookExecutionError extends Error {
  constructor(kind: keyof typeof webhookErrorSummaries) {
    super(webhookErrorSummaries[kind]);
  }
}

export function safeWebhookErrorSummary(summary: string) {
  return Object.values(webhookErrorSummaries).find((safe) => safe === summary) ?? "Webhook request failed.";
}
