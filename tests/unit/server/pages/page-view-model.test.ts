import { describe, expect, test } from "vitest";

import { createPageViewModel } from "@/server/pages/page-view-model";

describe("Page view model", () => {
  test("derives controls and validation from Source fields", () => {
    const model = createPageViewModel({
      mode: "json-schema",
      presentation: null,
      source: '{"type":"object","properties":{"email":{"type":"string","format":"email","minLength":5,"maxLength":254}},"required":["email"],"additionalProperties":false}',
    });

    expect(model.fields).toMatchObject([{
      page: 1,
      valueType: "string",
      htmlControl: "email",
      label: "Email",
      maxLength: 254,
      minLength: 5,
      name: "email",
      required: true,
    }]);
  });

  test("applies Page presentation only to fields that remain in the Source", () => {
    const model = createPageViewModel({
      mode: "json-schema",
      presentation: {
        fields: [
          { label: "Message", name: "message", order: 1, textControl: "textarea" },
          { label: "Removed", name: "removed", order: 0 },
        ],
      },
      source: '{"type":"object","properties":{"message":{"type":"string"}},"required":[],"additionalProperties":false}',
    });

    expect(model.fields).toMatchObject([{
      page: 1,
      valueType: "string",
      htmlControl: "textarea",
      label: "Message",
      name: "message",
      required: false,
    }]);
  });
});

