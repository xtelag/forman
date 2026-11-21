import { codeToHtml } from "shiki";

export type CodeLanguage = "bash" | "html" | "javascript" | "json";

export function highlightCode(code: string, language: CodeLanguage) {
  return codeToHtml(code, { lang: language, theme: "github-light" });
}
