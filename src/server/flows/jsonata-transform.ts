import jsonata from "jsonata";

function jsonataErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const details = error as { code?: unknown; message?: unknown };
    if (typeof details.message === "string") {
      const code = typeof details.code === "string" ? ` (${details.code})` : "";
      return `${details.message}${code}`;
    }
  }
  return "Invalid JSONata expression";
}

export function validateJsonataExpression(
  expression: string | null | undefined,
) {
  if (!expression?.trim()) return;
  try {
    jsonata(expression);
  } catch (error) {
    throw new Error(
      `Invalid JSONata transformation: ${jsonataErrorMessage(error)}`,
    );
  }
}

export async function transformEnvelope(
  envelope: Record<string, unknown>,
  expression: string | null | undefined,
  bindings?: Record<string, unknown>,
) {
  if (!expression?.trim()) return envelope;
  const result = await jsonata(expression).evaluate(envelope, bindings);
  if (!result || Array.isArray(result) || typeof result !== "object") {
    throw new Error("JSONata transformation must return an object");
  }
  return result as Record<string, unknown>;
}
