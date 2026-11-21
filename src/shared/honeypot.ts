import { z } from "zod";

export const DEFAULT_HONEYPOT_FIELD = "forman_company_website";

export const honeypotFieldNamesSchema = z.array(
  z.string().transform(value => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, "Use 3–64 lowercase letters, numbers or underscores, starting with a letter."))
    .refine(value => value !== "altcha", "Reserved honeypot field name"),
).min(1).max(10).refine(names => new Set(names).size === names.length, "Honeypot field names must be unique");

export function parseHoneypotFieldNames(text: string): string[] {
  return honeypotFieldNamesSchema.parse(text.split(","));
}
