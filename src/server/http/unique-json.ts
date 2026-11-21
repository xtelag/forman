export class DuplicateJsonKeyError extends Error {
  constructor(readonly key: string) { super("Duplicate JSON property"); }
}

/** Validate JSON syntax first, then reject ambiguous duplicate object keys. */
export function parseUniqueJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const stack: Array<{ keys: Set<string>; expectingKey: boolean } | null> = [];
  const tokens = text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]/g);
  for (const [token] of tokens) {
    if (token === "{") stack.push({keys:new Set(),expectingKey:true});
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else {
      const object = stack.at(-1);
      if (!object) continue;
      if (token === ":") object.expectingKey = false;
      else if (token === ",") object.expectingKey = true;
      else if (token.startsWith('"') && object.expectingKey) {
        const key: string = JSON.parse(token);
        if (object.keys.has(key)) throw new DuplicateJsonKeyError(key);
        object.keys.add(key);
      }
    }
  }
  return value;
}
