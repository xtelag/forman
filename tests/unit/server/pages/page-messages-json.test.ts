import { expect, test } from "vitest";
import { parsePageMessages, serializePageMessages } from "@/shared/page-messages-json";

test("round-trips existing confirmation templates without changing their stored shape", () => {
  const definition = serializePageMessages("en", { successText: "Thank you, {{name}}", systemTexts: { submit: "Send" } });
  expect(JSON.parse(definition).confirmationText).toBe("Thank you, {{name}}");
  expect(parsePageMessages(definition, "en")).toEqual({ successText: "Thank you, {{name}}", systemTexts: { submit: "Send" } });
});

test("empty, omitted and reset confirmation text use the default success message", () => {
  for (const definition of ['{"confirmationText":""}', '{}', serializePageMessages("en")]) {
    expect(parsePageMessages(definition, "en")).toEqual({ successText: undefined, systemTexts: {} });
  }
});

test("rejects invalid confirmation values and still validates message variables", () => {
  for (const confirmationText of [42, null, {}, "x".repeat(1001)]) {
    expect(() => parsePageMessages(JSON.stringify({ confirmationText }), "en")).toThrow(/confirmationText/);
  }
  expect(() => parsePageMessages('{"minimum":"Too small"}', "en")).toThrow(/minimum/);
  expect(() => parsePageMessages('{"unknown":"Text"}', "en")).toThrow();
});


test("prefills confirmation with the effective success message and preserves custom text", () => {
  expect(JSON.parse(serializePageMessages("en")).confirmationText).toBe("The response has been submitted.");
  expect(JSON.parse(serializePageMessages("cs")).confirmationText).toBe("Děkujeme. Vaše odpověď byla odeslána.");
  expect(JSON.parse(serializePageMessages("en", { systemTexts: { success: "Received" } })).confirmationText).toBe("Received");
  expect(JSON.parse(serializePageMessages("en", { successText: "Welcome, {{name}}" })).confirmationText).toBe("Welcome, {{name}}");
});
