import { expect, test } from "vitest";
import { parseSystemTexts, serializeSystemTexts, resolveSystemTexts } from "@/shared/system-texts";
import { pagePresentationSchema } from "@/shared/contracts/page";
import { pageValueError } from "@/shared/page-form";

test("defaults serialize completely but persist only overrides; language changes preserve custom text", () => {
  expect(parseSystemTexts(serializeSystemTexts("en"), "en")).toEqual({});
  const overrides = parseSystemTexts('{"submit":"Send answers"}', "en");
  expect(parseSystemTexts(serializeSystemTexts("cs", overrides), "cs")).toEqual(overrides);
  expect(resolveSystemTexts("cs", overrides)).toMatchObject({submit: "Send answers", back: "Zpět"});
});
test("rejects unknown keys and missing/unknown variables in both JSON and API", () => {
  expect(()=>parseSystemTexts('{"wat":"X"}',"en")).toThrow();
  expect(()=>parseSystemTexts('{"minimum":"Too small"}',"en")).toThrow(/minimum/);
  expect(()=>parseSystemTexts('{"submit":"{unknown}"}',"en")).toThrow(/variables/);
  expect(pagePresentationSchema.safeParse({systemTexts:{minimum:"Too small"}}).success).toBe(false);
  expect(pagePresentationSchema.safeParse({systemTexts:{unknown:"X"}}).success).toBe(false);
});
test("custom validation messages interpolate field limits", () => {
  expect(pageValueError({name:"name",label:"Name",page:1,htmlControl:"text",valueType:"string",required:true,minLength:3},"x","en",{minLength:"At least {minLength}, please."})).toBe("At least 3, please.");
});


