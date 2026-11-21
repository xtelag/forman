import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminApiError, adminRequest } from "@/client/admin-api/client";
import { configureSource, createSource } from "@/client/admin-api/sources";
import { downloadFullBackup } from "@/client/admin-api/settings";
import { listSubmissions } from "@/client/admin-api/submissions";

describe("adminRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("turns a server error into an AdminApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      ),
    );

    await expect(adminRequest("/api/admin/v1/dashboard")).rejects.toMatchObject(
      {
        message: "Unauthorized",
        name: "AdminApiError",
        status: 401,
      } satisfies Partial<AdminApiError>,
    );
  });

  test("requests reauthentication without navigating away from unsaved work", async () => {
    const events = new EventTarget();
    let expired = false;
    events.addEventListener("forman:session-expired", () => {
      expired = true;
    });
    Object.assign(events, {
      location: { origin: "https://forman.example.test", href: "" },
    });
    vi.stubGlobal("window", events);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(adminRequest("/api/admin/v1/dashboard")).rejects.toMatchObject(
      { status: 401 },
    );
    expect(expired).toBe(true);
  });

  test("resolves undefined for an empty successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(
      adminRequest("/api/admin/v1/sources/form-1", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  test("encodes mutation payloads as JSON and preserves same-origin credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "form-1" }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createSource({ name: "Contact", type: "one-shot" });
    await configureSource("form-1", {
      allowedOrigins: [],
      altchaEnabled: false,
      challengeRateLimitPerMinute: null,
      honeypotEnabled: false,
      maxBodyBytes: 1_024,
      maxEntries: 1,
      maxKeyLength: 1,
      maxUniqueKeys: 1,
      maxValueLength: 1,
      maxValuesPerKey: 1,
      name: "Contact",
      retentionDays: null,
      storeReferer: false,
      storeUserAgent: false,
      submissionRateLimitPerMinute: null,
      successUrl: null,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/v1/sources",
      expect.objectContaining({
        body: JSON.stringify({ name: "Contact", type: "one-shot" }),
        credentials: "same-origin",
        headers: expect.objectContaining({
          "content-type": "application/json",
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/v1/sources/form-1",
      expect.objectContaining({
        body: expect.any(String),
        credentials: "same-origin",
        method: "PUT",
      }),
    );
  });

  test("serializes selected submission tags as repeated query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await listSubmissions({
      limit: 10,
      offset: 0,
      tagIds: ["sales", "support"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/v1/submissions?limit=10&offset=0&tagId=sales&tagId=support",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});

test("backup requests also request inline sign-in when unauthorized", async () => {
  const events = new EventTarget();
  let expired = false;
  events.addEventListener("forman:session-expired", () => {
    expired = true;
  });
  vi.stubGlobal("window", events);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  try {
    await expect(downloadFullBackup()).rejects.toMatchObject({ status: 401 });
    expect(expired).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
