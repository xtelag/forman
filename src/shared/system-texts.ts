import { z } from "zod";
export const pageMessages = {
  en: {
    number: "Enter a valid number.",
    integer: "Enter a whole number.",
    invalidValue: "This answer does not meet the form requirements.",
    boolean: "Choose yes or no.",
    string: "Enter text.",
    option: "Choose one of the available options.",
    minimum: "Enter a number of at least {minimum}.",
    maximum: "Enter a number no greater than {maximum}.",
    minLength: "Enter at least {minLength} characters.",
    maxLength: "Enter no more than {maxLength} characters.",
    email: "Enter a valid email address.",
    pattern: "Use the required format.",
    loadingForm: "Loading form…",
    loadError: "Could not load saved answers. Retry loading to continue.",
    retryLoad: "Retry loading",
    rateLimited: "Too many requests. Please wait before trying again.",
    wait: "Retry in {seconds} s.",
    unsaved: "Changes on this step are not saved yet.",
    navigationSave:
      "Answers are saved when moving between steps. Complete the form by clicking {submit} in the last step.",
    submit: "Submit",
    next: "Next",
    back: "Back",
    optional: "optional",
    success: "The response has been submitted.",
    saving: "Saving…",
    loading: "Loading saved answers…",
    error: "Could not save. Answers remain in this form. Try again.",
    invalid: "Check the fields marked with an error.",
    conflict:
      "This session changed elsewhere. Load the saved version before continuing.",
    reload: "Load saved version",
    discard: "This replaces local answers with the saved version. Continue?",
    retry: "Retry save",
    expired: "This session has expired. It cannot be reopened.",
    unavailable: "This session is unavailable.",
    copied: "Link copied.",
    copyError:
      "Could not copy the link. Copy the URL from the browser address bar instead.",
    copy: "Copy resume link",
    step: "Step {current} of {total}",
    preview: "Preview mode. Answers will not be submitted and Pipeline Actions will not run.",
    previewCompleted: "Preview completed. No answers were submitted and no Pipeline Actions were run.",
    required: "This field is required.",
    verify: "Complete the verification before saving.",
  },
  cs: {
    number: "Zadejte platné číslo.",
    integer: "Zadejte celé číslo.",
    invalidValue: "Odpověď nesplňuje požadavky formuláře.",
    boolean: "Vyberte ano nebo ne.",
    string: "Zadejte text.",
    option: "Vyberte jednu z nabízených možností.",
    minimum: "Zadejte číslo alespoň {minimum}.",
    maximum: "Zadejte číslo nejvýše {maximum}.",
    minLength: "Minimální počet znaků: {minLength}.",
    maxLength: "Maximální počet znaků: {maxLength}.",
    email: "Zadejte platnou e-mailovou adresu.",
    pattern: "Hodnota neodpovídá požadovanému formátu.",
    loadingForm: "Načítání formuláře…",
    loadError: "Uložené odpovědi se nepodařilo načíst. Zkuste načtení znovu.",
    retryLoad: "Zkusit načíst znovu",
    rateLimited: "Příliš mnoho požadavků. Před dalším pokusem chvíli počkejte.",
    wait: "Další pokus za {seconds} s.",
    unsaved: "Změny v tomto kroku zatím nejsou uložené.",
    navigationSave:
      "Odpovědi se ukládají při přechodu mezi kroky. Formulář dokončíte tlačítkem {submit} v posledním kroku.",
    submit: "Odeslat",
    next: "Další",
    back: "Zpět",
    optional: "nepovinné",
    success: "Děkujeme. Vaše odpověď byla odeslána.",
    saving: "Ukládání…",
    loading: "Načítání uložených odpovědí…",
    error:
      "Uložení se nezdařilo. Odpovědi zůstaly ve formuláři. Zkuste to znovu.",
    invalid: "Zkontrolujte označená pole.",
    conflict:
      "Relace se změnila jinde. Před pokračováním načtěte uloženou verzi.",
    reload: "Načíst uloženou verzi",
    discard: "Tím nahradíte místní odpovědi uloženou verzí. Pokračovat?",
    retry: "Zkusit uložit znovu",
    expired: "Platnost relace vypršela. Nelze ji znovu otevřít.",
    unavailable: "Tato relace není dostupná.",
    copied: "Odkaz byl zkopírován.",
    copyError:
      "Odkaz se nepodařilo zkopírovat. Zkopírujte adresu z prohlížeče.",
    copy: "Kopírovat odkaz pro pokračování",
    step: "Krok {current} z {total}",
    preview: "Režim náhledu. Odpovědi se neodešlou a akce Pipeline se nespustí.",
    previewCompleted: "Náhled dokončen. Odpovědi nebyly odeslány a žádné akce Pipeline se nespustily.",
    required: "Toto pole je povinné.",
    verify: "Před uložením dokončete ověření.",
  },
};

export type SystemTextKey = keyof typeof pageMessages.en;
export type SystemTexts = Record<SystemTextKey, string>;
export type SystemTextOverrides = Partial<SystemTexts>;
export const systemTextKeys: SystemTextKey[] = [
  "submit",
  "next",
  "back",
  "copy",
  "copied",
  "copyError",
  "step",
  "navigationSave",
  "optional",
  "success",
  "preview",
  "previewCompleted",
  "required",
  "number",
  "integer",
  "invalidValue",
  "boolean",
  "string",
  "option",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "email",
  "pattern",
  "verify",
  "loadingForm",
  "loading",
  "saving",
  "unsaved",
  "invalid",
  "error",
  "loadError",
  "retryLoad",
  "retry",
  "reload",
  "conflict",
  "discard",
  "expired",
  "unavailable",
  "rateLimited",
  "wait",
];
const keySchema = z.enum(systemTextKeys as [SystemTextKey, ...SystemTextKey[]]);
const placeholders = (value: string) =>
  [...new Set(value.match(/\{[^{}]+\}/g) ?? [])].sort();
function templateError(key: SystemTextKey, text: string): string | null {
  const expected = placeholders(pageMessages.en[key]);
  if (
    JSON.stringify(placeholders(text)) !== JSON.stringify(expected) ||
    /\{\{|\}\}/.test(text)
  )
    return `Keep exactly these variables: ${expected.join(", ") || "none"}.`;
  return null;
}
export const systemTextsSchema = z
  .partialRecord(keySchema, z.string().trim().min(1).max(2000))
  .superRefine((values, context) => {
    for (const [key, text] of Object.entries(values)) {
      const error = templateError(key as SystemTextKey, text);
      if (error)
        context.addIssue({ code: "custom", path: [key], message: error });
    }
  });
export function resolveSystemTexts(
  language: "en" | "cs",
  overrides?: SystemTextOverrides,
): SystemTexts {
  return { ...pageMessages[language], ...overrides };
}
export function formatSystemText(
  template: string,
  values: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}
export function serializeSystemTexts(
  language: "en" | "cs",
  overrides?: SystemTextOverrides,
): string {
  const texts = resolveSystemTexts(language, overrides);
  return JSON.stringify(Object.fromEntries(systemTextKeys.map(key=>[key,texts[key]])),null,2);
}
export function parseSystemTexts(definition:string,language:"en"|"cs"):SystemTextOverrides {
  let raw:unknown;
  try {raw=JSON.parse(definition);} catch(error) {throw new Error(`Invalid JSON: ${error instanceof Error?error.message:"Check the syntax."}`);}
  const parsed=systemTextsSchema.safeParse(raw);
  if(!parsed.success) throw new Error(parsed.error.issues.map(issue=>`${issue.path.join(".")||"texts"}: ${issue.message}`).join("; "));
  return Object.fromEntries(Object.entries(parsed.data).filter(([key,text])=>text!==pageMessages[language][key as SystemTextKey]));
}
