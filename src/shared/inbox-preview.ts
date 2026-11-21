function previewScalar(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

function previewSource(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== "object" || Array.isArray(output))
    return null;
  const source = output as Record<string, unknown>;
  const payload = source.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload))
    return payload as Record<string, unknown>;
  return source;
}

export function inboxPreview(output: unknown) {
  const source = previewSource(output);
  if (!source) return "—";
  const values = Object.values(source)
    .map(previewScalar)
    .filter(Boolean)
    .slice(0, 3);
  return values.length ? values.join(" · ") : "—";
}
