import { pageText } from "@/shared/page-form";

export const productName = "Forman";

/** Admin browser tab title: most specific part first, product name last. */
export function adminDocumentTitle(title: string) {
  const trimmed = title.trim();
  return trimmed ? `${trimmed} · ${productName}` : productName;
}

/**
 * Public form tab title. Respondents see the form title only; answer
 * placeholders are resolved with their fallbacks because no answers exist yet.
 */
export function publicFormDocumentTitle(
  title: string,
  fallbacks: Record<string, string> = {},
) {
  return pageText(title, {}, fallbacks).replace(/\s+/g, " ").trim() || "Form";
}
