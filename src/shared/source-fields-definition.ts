const fieldName = /^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/;
function invalidDefinition(message = "Source fields definition is invalid."): never { throw new Error(message); }

export function parseJsonSchema(source: string) {
  const root = JSON.parse(source);
  if (!root || root.type !== "object" || root.additionalProperties !== false || !root.properties || typeof root.properties !== "object" || Array.isArray(root.properties)) invalidDefinition();
  const names = Object.keys(root.properties);
  if (!names.length || names.some(name => !fieldName.test(name))) invalidDefinition();
  for (const property of Object.values(root.properties) as Array<Record<string, unknown>>) {
    if (!property || typeof property !== "object") invalidDefinition();
    if ("x-page" in property) invalidDefinition("Define steps in Built-in Forms, not Source fields.");
  }
  return root as { type: "object"; additionalProperties: false; properties: Record<string, Record<string, unknown>>; required?: string[] };
}
