import { describe, expect, it } from "vitest";
import { honeypotFieldNamesSchema, parseHoneypotFieldNames } from "@/shared/honeypot";

describe("honeypot field configuration", () => {
  it("ignores whitespace in comma-separated names", () => {
    expect(parseHoneypotFieldNames(" web site , phone_ number \n")).toEqual(["website", "phone_number"]);
  });
  it("accepts up to ten names and rejects invalid, reserved and duplicate names", () => {
    expect(honeypotFieldNamesSchema.parse(Array.from({length: 10}, (_, i) => `trap_${i}`))).toHaveLength(10);
    for (const names of [[], ["altcha"], ["aa"], ["trap", "tr ap"], Array.from({length: 11}, (_, i) => `trap_${i}`)]) {
      expect(honeypotFieldNamesSchema.safeParse(names).success).toBe(false);
    }
    expect(() => parseHoneypotFieldNames("trap,")).toThrow();
  });
});
