import { pagePresentationSchema, type PagePresentation } from "@/shared/contracts/page";
import { parseSystemTexts, resolveSystemTexts, serializeSystemTexts } from "@/shared/system-texts";

/** Keep the editor JSON compatible with the existing persisted presentation. */
export function serializePageMessages(language: "en" | "cs", presentation?: PagePresentation | null) {
  const texts = JSON.parse(serializeSystemTexts(language, presentation?.systemTexts));
  const messages = { ...texts, confirmationText: presentation?.successText || texts.success };
  const sorted = Object.fromEntries(Object.entries(messages).sort(([left], [right]) => left.localeCompare(right, "en")));
  return JSON.stringify(sorted, null, 2);
}

export function parsePageMessages(definition: string, language: "en" | "cs") {
  let raw: unknown;
  try { raw = JSON.parse(definition); }
  catch (error) { throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : "Check the syntax."}`); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Messages must be a JSON object.");
  const { confirmationText, ...texts } = raw as Record<string, unknown>;
  const systemTexts = parseSystemTexts(JSON.stringify(texts), language);
  const defaultConfirmation = resolveSystemTexts(language, systemTexts).success;
  const parsed = pagePresentationSchema.safeParse({ successText: confirmationText === defaultConfirmation ? undefined : confirmationText });
  if (!parsed.success) throw new Error(`confirmationText: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
  return { systemTexts, successText: parsed.data.successText || undefined };
}
