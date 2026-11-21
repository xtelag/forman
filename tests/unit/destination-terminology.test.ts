import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, test } from "vitest";

const forbiddenRuntimeTerms = [
  /\b[Nn]ext[ -]?[Hh]ops?\b/,
  /\b[Nn]extHop\b/,
  /\bnext_hop\b/,
  /\/app\/next-hops\b/,
  /\/api\/admin\/v1\/next-hops\b/,
];

const historicalAllowlist = new Set([
  "tests/unit/destination-terminology.test.ts",
]);

const liveTextExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function liveFiles(directory = process.cwd(), prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (
        [
          ".git",
          ".next",
          ".runtime",
          "coverage",
          "node_modules",
          "playwright-report",
          "test-results",
        ].includes(entry.name)
      )
        return [];
      return liveFiles(join(directory, entry.name), file);
    }
    return entry.isFile() && liveTextExtensions.has(extname(entry.name))
      ? [file]
      : [];
  });
}

function currentTrackedLiveFiles(
  listTracked = () =>
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    )
      .split("\0")
      .filter(Boolean),
) {
  try {
    return listTracked();
  } catch {
    // The sandbox may not be able to reach the host worktree's gitdir. Scanning this
    // execution worktree is stricter: it includes every tracked live file and
    // also refuses an accidentally untracked runtime file.
    return liveFiles();
  }
}

function activeLiveFiles() {
  return currentTrackedLiveFiles().filter(
    (file) =>
      existsSync(join(process.cwd(), file)) && !historicalAllowlist.has(file),
  );
}

function terminologyViolations(
  files: readonly string[],
  read = (file: string) => readFileSync(join(process.cwd(), file), "utf8"),
) {
  return files.filter((file) =>
    forbiddenRuntimeTerms.some((pattern) => pattern.test(read(file))),
  );
}

describe("Pipeline terminology", () => {
  test("keeps retired Next-hop terms out of tracked live files", () => {
    expect(terminologyViolations(activeLiveFiles())).toEqual([]);
  }, 10_000);

  test("covers the active reference, routes, contracts, and tests", () => {
    expect(activeLiveFiles()).toEqual(
      expect.arrayContaining([
        "DESIGN.md",
        "src/components/api-docs/api-docs-screen.tsx",
        "src/app/api/admin/v1/pipelines/route.ts",
        "src/shared/contracts/admin.ts",
        "tests/integration/server/pipelines/admin-pipeline-handler.test.ts",
        "tests/unit/server/routes/webhook-endpoint.test.ts",
      ]),
    );
    expect(
      terminologyViolations(["AGENTS.md", "DESIGN.md"], (file) =>
        file === "AGENTS.md"
          ? "/api/admin/v1/next-hops"
          : "Next hop credentials",
      ),
    ).toEqual(["AGENTS.md", "DESIGN.md"]);
  });

  test("rejects retired terminology in an active E2E .mjs helper when Git fallback is forced", () => {
    const files = currentTrackedLiveFiles(() => {
      throw new Error("Git metadata is unavailable");
    });
    const helper = "tests/e2e/support/flash-hook-server.mjs";
    expect(files).toContain(helper);
    expect(
      terminologyViolations([helper], () => "Next hop credentials"),
    ).toEqual([helper]);
  });
});
