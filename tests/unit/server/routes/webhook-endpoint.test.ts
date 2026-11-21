import { describe, expect, test } from "vitest";

import {
  assertPublicWebhookEndpoint,
  resolvePublicWebhookEndpoint,
} from "@/server/routes/webhook-endpoint";

describe("assertPublicWebhookEndpoint", () => {
  test("allows an HTTPS hostname that resolves to a public address", async () => {
    await expect(assertPublicWebhookEndpoint("https://hooks.example.test/submission", async () => ["8.8.8.8"])).resolves.toBeUndefined();
  });

  test("returns the exact public addresses used for the connection", async () => {
    await expect(
      resolvePublicWebhookEndpoint(
        "https://hooks.example.test/submission?event=created",
        async () => ["8.8.8.8", "1.1.1.1"],
      ),
    ).resolves.toEqual({
      addresses: ["8.8.8.8", "1.1.1.1"],
      url: new URL("https://hooks.example.test/submission?event=created"),
    });
  });

  test("rejects a hostname resolving to an internal address", async () => {
    await expect(assertPublicWebhookEndpoint("https://hooks.example.test/submission", async () => ["127.0.0.1"])).rejects.toThrow("public HTTPS URL");
  });

  test("allows only the configured E2E Flash Hook endpoint in the explicit Playwright runtime", async () => {
    const previous = process.env.FORMAN_E2E_FLASH_HOOK_URL;
    const previousRuntime = process.env.FORMAN_E2E_TEST_RUNTIME;
    process.env.FORMAN_E2E_FLASH_HOOK_URL = "https://127.0.0.1:3443/flash";
    process.env.FORMAN_E2E_TEST_RUNTIME = "playwright";
    try {
      await expect(assertPublicWebhookEndpoint("https://127.0.0.1:3443/flash", async () => ["127.0.0.1"])).resolves.toBeUndefined();
      await expect(assertPublicWebhookEndpoint("https://127.0.0.1:3443/other", async () => ["127.0.0.1"])).rejects.toThrow("public HTTPS URL");
    } finally {
      if (previous === undefined) delete process.env.FORMAN_E2E_FLASH_HOOK_URL;
      else process.env.FORMAN_E2E_FLASH_HOOK_URL = previous;
      if (previousRuntime === undefined) delete process.env.FORMAN_E2E_TEST_RUNTIME;
      else process.env.FORMAN_E2E_TEST_RUNTIME = previousRuntime;
    }
  });

  test("rejects the configured local Flash URL in a production-like runtime", async () => {
    const previous = process.env.FORMAN_E2E_FLASH_HOOK_URL;
    const previousRuntime = process.env.FORMAN_E2E_TEST_RUNTIME;
    process.env.FORMAN_E2E_FLASH_HOOK_URL = "https://127.0.0.1:3443/flash";
    delete process.env.FORMAN_E2E_TEST_RUNTIME;
    try {
      await expect(assertPublicWebhookEndpoint("https://127.0.0.1:3443/flash", async () => ["127.0.0.1"])).rejects.toThrow("public HTTPS URL");
    } finally {
      if (previous === undefined) delete process.env.FORMAN_E2E_FLASH_HOOK_URL;
      else process.env.FORMAN_E2E_FLASH_HOOK_URL = previous;
      if (previousRuntime === undefined) delete process.env.FORMAN_E2E_TEST_RUNTIME;
      else process.env.FORMAN_E2E_TEST_RUNTIME = previousRuntime;
    }
  });

  test("rejects a non-HTTPS or credentialed endpoint before resolving it", async () => {
    await expect(assertPublicWebhookEndpoint("http://hooks.example.test", async () => { throw new Error("must not resolve"); })).rejects.toThrow("public HTTPS URL");
    await expect(assertPublicWebhookEndpoint("https://token@hooks.example.test", async () => { throw new Error("must not resolve"); })).rejects.toThrow("public HTTPS URL");
  });
});
