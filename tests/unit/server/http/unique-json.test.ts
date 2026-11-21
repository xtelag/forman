import { expect, test } from "vitest";
import { parseUniqueJson, DuplicateJsonKeyError } from "@/server/http/unique-json";

test.each(['{"trap":"bot","trap":""}', '{"trap":"bot","tr\\u0061p":""}', '{"nested":{"trap":1,"trap":2}}'])('rejects duplicate properties: %s', text => {
  expect(() => parseUniqueJson(text)).toThrow(DuplicateJsonKeyError);
});
test.each(['{"a":{"trap":1},"b":{"trap":2}}', '[{"trap":1},{"trap":2}]', '{"text":"a, { \\"b\\": 3 }","next":true}', '{"items":[1,2],"next":3}'])('preserves valid JSON: %s', text => {
  expect(parseUniqueJson(text)).toEqual(JSON.parse(text));
});
test('rejects malformed JSON', () => expect(() => parseUniqueJson('{')).toThrow(SyntaxError));
