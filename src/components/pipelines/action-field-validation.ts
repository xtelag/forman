import { z } from "zod";

const email = z.string().trim().email().max(320);

/** Validate only the current Action's rendered fields, including conditional auth.
 * Keep configured secrets optional and leave server-only validation to the API.
 */
export function validateActionFields(
  container: HTMLElement,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of container.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input, textarea")) {
    if (!field.id || field.disabled || field.type === "hidden") continue;
    const value = field.value.trim();
    const label =
      field.labels?.[0]?.textContent?.replace(/\*/g, "").trim() || "value";
    if (field.hasAttribute("data-email-recipients")) {
      const recipients = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (!recipients.length)
        errors[field.id] = "Enter at least one email recipient.";
      else if (
        recipients.some((recipient) => !email.safeParse(recipient).success)
      )
        errors[field.id] = "Enter a valid email address on each line.";
    } else if (field.required && !value) {
      errors[field.id] = "Enter " + label.toLowerCase() + ".";
    } else if (value && !field.validity.valid) {
      if (field.validity.typeMismatch)
        errors[field.id] =
          "Enter a valid " + (field.type === "url" ? "URL" : "value") + ".";
      else if (field.validity.rangeUnderflow || field.validity.rangeOverflow)
        errors[field.id] = "Enter a value within the allowed range.";
      else errors[field.id] = "Enter a valid value.";
    }
  }
  return errors;
}
