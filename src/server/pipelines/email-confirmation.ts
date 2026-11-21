import { z } from "zod";

const text = z.string().trim().min(1);

export const emailConfirmationConfigurationSchema = z.object({
  booleanField: text.max(120),
  completedText: text.max(10_000).default("Confirmation has been received. This page can now be closed."),
  confirmationCtaLabel: text.max(120).default("Confirm"),
  confirmationText: text.max(10_000).default("Confirm continuation."),
  emailCtaLabel: text.max(120).default("Open confirmation"),
  emailField: text.max(120),
  emailText: text.max(10_000).default("Please use the button below to continue."),
  subject: text.max(200).default("Confirmation required"),
  timeoutHours: z.number().int().min(1).max(168).default(24),
});

export type EmailConfirmationConfiguration = z.infer<typeof emailConfirmationConfigurationSchema>;

export function normalizeEmailConfirmationConfiguration(value: unknown) {
  return emailConfirmationConfigurationSchema.parse(value);
}

function valueAtPath(value: unknown, path: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value, path)) return (value as Record<string, unknown>)[path];
  return path.split(".").reduce<unknown>((current, key) => (
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
  ), value);
}

function renderedValue(value: unknown) {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function renderEmailConfirmationText(
  template: string,
  envelope: { meta: Record<string, unknown>; payload: Record<string, unknown> },
) {
  return template.replace(/\{\{(meta|payload)\.([\w.-]+)\}\}/g, (_, scope: "meta" | "payload", path: string) => (
    renderedValue(valueAtPath(envelope[scope], path))
  ));
}

export function canonicalEmailRecipient(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return z.string().email().safeParse(normalized).success ? normalized : null;
}
