import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { adminDocumentTitle, publicFormDocumentTitle } from "@/shared/document-title";

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

describe("document titles", () => {
  test("puts the specific part first and the product last in the administration", () => {
    expect(adminDocumentTitle("Contact · Source")).toBe("Contact · Source · Forman");
    expect(adminDocumentTitle("  ")).toBe("Forman");
  });

  test("shows respondents the form title with placeholders resolved", () => {
    expect(publicFormDocumentTitle("Hello, {{name}}", { name: "guest" })).toBe("Hello, guest");
    expect(publicFormDocumentTitle("Survey {{ year }}  ")).toBe("Survey");
    expect(publicFormDocumentTitle("{{name}}")).toBe("Form");
  });

  test("gives every administration route its own title", () => {
    const untitled = pageFiles(join(process.cwd(), "src/app/app")).filter((file) => {
      const source = readFileSync(file, "utf8");
      // Redirect-only routes never render a page.
      if (!source.includes("return <") && source.includes("redirect(")) return false;
      return !/export (const metadata|async function generateMetadata)/.test(source);
    });
    expect(untitled).toEqual([]);
  });
});
