import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { NextRequest } from "next/server";

import { enterMaintenanceMode } from "@/server/backup/maintenance-mode";
import { proxy } from "@/proxy";

describe("maintenance proxy", () => {
  const original = { ...process.env };
  const directories: string[] = [];

  beforeEach(() => {
    process.env.FORMAN_BASE_ORIGIN = "https://forman.example.test";
    process.env.FORMAN_TRUST_PROXY = "true";
  });

  afterEach(() => {
    process.env = { ...original };
    directories
      .splice(0)
      .forEach((directory) =>
        rmSync(directory, { force: true, recursive: true }),
      );
  });

  test("allows only the health probe to bypass the public origin", () => {
    process.env.FORMAN_TRUST_PROXY = "false";
    expect(proxy(new NextRequest("http://127.0.0.1:3000/health")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("http://127.0.0.1:3000/health", { method: "HEAD" })).headers.get("x-middleware-next")).toBe("1");
    for (const pathname of ["/login", "/health/other", "/api/admin/v1/application"]) {
      expect(proxy(new NextRequest(`http://127.0.0.1:3000${pathname}`)).status).toBe(421);
    }
    expect(proxy(new NextRequest("http://127.0.0.1:3000/health", { method: "POST" })).status).toBe(421);
  });

  test("blocks application work but lets the active restore finish", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "forman-proxy-"));
    directories.push(directory);
    mkdirSync(path.join(directory, "data"));
    const databasePath = path.join(directory, "data", "forman.sqlite");
    process.env.FORMAN_DATABASE_PATH = databasePath;
    const leave = enterMaintenanceMode(databasePath);

    const blocked = proxy(
      new NextRequest("https://forman.example.test/api/submit/example"),
    );
    const restore = proxy(
      new NextRequest(
        "https://forman.example.test/api/admin/v1/backup/restore",
      ),
    );

    expect(blocked.status).toBe(503);
    expect(blocked.headers.get("retry-after")).toBe("5");
    expect(restore.headers.get("x-middleware-next")).toBe("1");
    leave();
  });

  test("rejects administrative mutations that do not originate from Forman", () => {
    process.env.FORMAN_BASE_ORIGIN = "https://forman.example.test";

    const foreign = proxy(
      new NextRequest(
        "https://forman.example.test/api/admin/v1/pages/example",
        {
          headers: { origin: "null" },
          method: "PATCH",
        },
      ),
    );
    const trusted = proxy(
      new NextRequest(
        "https://forman.example.test/api/admin/v1/pages/example",
        {
          headers: { origin: "https://forman.example.test" },
          method: "PATCH",
        },
      ),
    );

    expect(foreign.status).toBe(403);
    expect(trusted.headers.get("x-middleware-next")).toBe("1");
  });

  test("uses the configured public origin behind a reverse proxy", () => {
    process.env.FORMAN_BASE_ORIGIN = "https://forman.dev.localhost:5173";
    process.env.FORMAN_TRUST_PROXY = "true";

    const trusted = proxy(
      new NextRequest("http://forman-app:3000/api/admin/v1/pages", {
        headers: {
          origin: "https://forman.dev.localhost:5173",
          "x-forwarded-host": "forman.dev.localhost:5173",
          "x-forwarded-proto": "https",
        },
        method: "POST",
      }),
    );

    expect(trusted.headers.get("x-middleware-next")).toBe("1");
  });

  test("serves Pages and administration on the base origin without an opt-in", () => {
    const page = proxy(new NextRequest("https://forman.example.test/pages/page-a"));
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("set-cookie")).toBeNull();
    expect(proxy(new NextRequest("https://forman.example.test/app/pages")).headers.get("x-middleware-next")).toBe("1");
  });

  test("reports a mismatched public address without serving the requested path", async () => {
    for (const pathname of ["/", "/pages/page-a", "/app/pages", "/api/admin/v1/pages"]) {
      const response = proxy(new NextRequest(`https://unknown.example.test${pathname}`));
      expect(response.status).toBe(421);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe(
        "Request address does not match Forman's configured public URL (FORMAN_BASE_ORIGIN).\n",
      );
    }

    const head = proxy(new NextRequest("https://unknown.example.test/", { method: "HEAD" }));
    expect(head.status).toBe(421);
    expect(head.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(head.body).toBeNull();
  });

  test("ignores forged forwarded hosts when proxy trust is disabled", () => {
    process.env.FORMAN_BASE_ORIGIN = "https://forman.example.test";
    process.env.FORMAN_TRUST_PROXY = "false";

    const response = proxy(
      new NextRequest("https://forman.example.test/pages/page-a", {
        headers: {
          "x-forwarded-host": "pages.forman.example.test",
          "x-forwarded-proto": "https",
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("checks the direct Host against the configured origin in a standalone deployment", () => {
    process.env.FORMAN_BASE_ORIGIN = "http://localhost:8080";
    process.env.FORMAN_TRUST_PROXY = "false";

    for (const pathname of ["/login", "/app", "/pages/page-a"]) {
      const request = (host: string) => new NextRequest(`https://0.0.0.0:3000${pathname}`, {
        headers: {
          host,
          "x-forwarded-host": "localhost:8080",
          "x-forwarded-proto": "https",
        },
      });

      expect(proxy(request("localhost:8080")).headers.get("x-middleware-next")).toBe("1");
      expect(proxy(request("localhost:3000")).status).toBe(421);
      expect(proxy(request("localhost:8080/invalid")).status).toBe(421);
    }
  });

  test("adds the administrator response policy only to administrator surfaces", () => {
    const administratorPaths = [
      "/app",
      "/login",
      "/api/admin/v1/dashboard",
    ];
    for (const pathname of administratorPaths) {
      const response = proxy(new NextRequest(`https://forman.example.test${pathname}`));
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }

    const submission = proxy(new NextRequest("https://forman.example.test/api/submit/source-a"));
    expect(submission.headers.get("content-security-policy")).toBeNull();
  });
});
