import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureE2eRateLimits } from "./support/rate-limits";

type PopupField = {
  label?: string;
  name: string;
  required?: boolean;
  type: "email" | "text" | "textarea";
};

type PopupConfiguration = {
  altchaEnabled?: boolean;
  description?: string;
  fields: PopupField[];
  sourceId: string;
  honeypotEnabled?: boolean;
  submitLabel?: string;
  title: string;
  trigger?: string;
};

async function authenticate(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/app");
  await ensureE2eRateLimits(page);
}

async function createSource(page: Page, name: string) {
  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(name);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page.getByRole("dialog", { name: "Create Source", exact: true }).getByRole("button", { name: "Create Source", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  return new URL(page.url()).pathname.split("/").at(-1)!;
}

async function configureSource(
  page: Page,
  sourceId: string,
  name: string,
  configuration: {
    allowedOrigins?: string[];
    altchaEnabled: boolean;
    honeypotEnabled: boolean;
  },
) {
  const response = await page.request.put(`/api/admin/v1/sources/${sourceId}`, {
    data: {
      allowedOrigins: configuration.allowedOrigins ?? [],
      altchaEnabled: configuration.altchaEnabled,
      challengeRateLimitPerMinute: null,
      honeypotEnabled: configuration.honeypotEnabled,
      maxBodyBytes: 65_536,
      maxEntries: 50,
      maxKeyLength: 100,
      maxUniqueKeys: 30,
      maxValueLength: 10_000,
      maxValuesPerKey: 20,
      name,
      retentionDays: null,
      storeReferer: false,
      storeUserAgent: false,
      submissionRateLimitPerMinute: null,
      successUrl: null,
    },
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function loadQueuedWidget(page: Page, configuration: PopupConfiguration) {
  await page.setContent("<!doctype html><html><head><title>Widget host</title></head><body><main><h1>Host page</h1></main></body></html>");
  const capabilityResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "GET"
      && response.url().endsWith(`/api/submit/${configuration.sourceId}`),
  );

  await page.evaluate((config) => {
    if (config.trigger) {
      const opener = document.createElement("button");
      opener.id = config.trigger.slice(1);
      opener.type = "button";
      opener.textContent = "Open host form";
      document.querySelector("main")!.appendChild(opener);
    }

    type FormanQueue = ((...args: unknown[]) => void) & { q?: unknown[][] };
    const queuedForman: FormanQueue = (...args: unknown[]) => {
      (queuedForman.q ||= []).push(args);
    };
    (window as typeof window & { forman?: FormanQueue }).forman = queuedForman;
    queuedForman("create", config);

    const script = document.createElement("script");
    script.src = "/public/pop-up-v1.js";
    document.head.appendChild(script);
  }, configuration);

  const capabilityResponse = await capabilityResponsePromise;
  expect(capabilityResponse.ok()).toBe(true);
  return capabilityResponse;
}

function sourceName(testInfo: TestInfo, suffix: string) {
  return `Popup ${suffix} ${testInfo.project.name}-${testInfo.retry}`;
}

test("queued floating widget submits on-page and stores the submission", async ({ page }, testInfo) => {
  await authenticate(page);
  const name = sourceName(testInfo, "flow");
  const sourceId = await createSource(page, name);
  await configureSource(page, sourceId, name, { altchaEnabled: false, honeypotEnabled: false });

  const capabilityResponse = await loadQueuedWidget(page, {
    description: "We will reply shortly.",
    fields: [
      { label: "Email address", name: "email", required: true, type: "email" },
      { label: "Message", name: "message", required: true, type: "textarea" },
    ],
    sourceId,
    submitLabel: "Send message",
    title: "Contact support",
  });
  await expect(capabilityResponse.json()).resolves.toEqual({
    altchaEnabled: false,
    honeypotEnabled: false,
    honeypotFieldNames: expect.any(Array),
  });

  const trigger = page.locator("[data-forman-floating-trigger]");
  await expect(trigger).toHaveText("Contact support");
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Contact support" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close form" })).toBeFocused();
  await expect(dialog).toContainText("We will reply shortly.");
  await expect.poll(() => dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0
      && bounds.right <= document.documentElement.clientWidth + 1
      && bounds.top >= 0
      && bounds.bottom <= window.innerHeight + 1;
  })).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();

  const email = `popup-${testInfo.project.name}-${testInfo.retry}@example.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Message").fill("A stored popup message");
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Message")).toHaveValue("A stored popup message");

  const hostUrl = page.url();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toHaveText("Response submitted.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("[data-forman-state]:not([hidden])")).toHaveCount(1);
  await expect(page).toHaveURL(hostUrl);

  await page.goto(`/app/submissions?search=${encodeURIComponent(email)}`);
  const submissionLink = page.locator('a[href^="/app/submissions/"]').filter({visible:true}).first();
  await expect(submissionLink).toBeVisible();
  await submissionLink.click();
  // The Submission payload opens in the Fields view.
  const payload = page.locator('[data-slot="resource-section"]', { hasText: "Payload" });
  await expect(payload).toContainText(email);
  await expect(payload).toContainText("A stored popup message");
});

test("selector trigger opens the widget without adding a floating button", async ({ page }, testInfo) => {
  await authenticate(page);
  const sourceId = await createSource(page, sourceName(testInfo, "selector"));

  await loadQueuedWidget(page, {
    fields: [{ label: "Name", name: "name", required: true, type: "text" }],
    sourceId,
    title: "Request a callback",
    trigger: "#host-popup-trigger",
  });

  const hostTrigger = page.getByRole("button", { name: "Open host form" });
  await expect(page.locator("[data-forman-floating-trigger]")).toHaveCount(0);
  await hostTrigger.click();
  await expect(page.getByRole("dialog", { name: "Request a callback" })).toBeVisible();
  await page.getByRole("button", { name: "Close form" }).click();
  await expect(hostTrigger).toBeFocused();
  await expect(page.locator("[data-forman-floating-trigger]")).toHaveCount(0);
});

test("server capabilities independently require ALTCHA and honeypot controls", async ({ page }, testInfo) => {
  await authenticate(page);

  const altchaName = sourceName(testInfo, "ALTCHA");
  const altchaSourceId = await createSource(page, altchaName);
  await configureSource(page, altchaSourceId, altchaName, {
    altchaEnabled: true,
    honeypotEnabled: false,
  });

  let altchaScriptRequests = 0;
  await page.route("**/vendor/altcha/altcha.js", async (route) => {
    altchaScriptRequests += 1;
    await route.fulfill({
      body: "customElements.define('altcha-widget', class extends HTMLElement {});",
      contentType: "application/javascript",
    });
  });
  const altchaCapabilityResponse = await loadQueuedWidget(page, {
    altchaEnabled: false,
    fields: [{ label: "Email", name: "email", type: "email" }],
    sourceId: altchaSourceId,
    honeypotEnabled: false,
    title: "ALTCHA protected form",
  });
  await expect(altchaCapabilityResponse.json()).resolves.toEqual({
    altchaEnabled: true,
    honeypotEnabled: false,
    honeypotFieldNames: expect.any(Array),
  });
  await expect(page.locator("altcha-widget")).toHaveAttribute(
    "challengeurl",
    `http://localhost:3100/api/challenge/${altchaSourceId}`,
  );
  await expect(page.locator('input[name="forman_company_website"]')).toHaveCount(0);
  await expect.poll(() => altchaScriptRequests).toBe(1);

  const honeypotName = sourceName(testInfo, "honeypot");
  const honeypotSourceId = await createSource(page, honeypotName);
  await configureSource(page, honeypotSourceId, honeypotName, {
    altchaEnabled: false,
    honeypotEnabled: true,
  });
  const honeypotCapabilityResponse = await loadQueuedWidget(page, {
    altchaEnabled: false,
    fields: [{ label: "Message", name: "message", type: "textarea" }],
    sourceId: honeypotSourceId,
    honeypotEnabled: false,
    title: "Honeypot protected form",
  });
  const honeypotCapabilities = await honeypotCapabilityResponse.json();
  expect(honeypotCapabilities).toEqual({
    altchaEnabled: false,
    honeypotEnabled: true,
    honeypotFieldNames: expect.any(Array),
  });
  const honeypot = page.locator(`input[name="${honeypotCapabilities.honeypotFieldNames[0]}"]`);
  await expect(honeypot).toHaveCount(1);
  await expect(honeypot).toHaveAttribute("data-forman-honeypot", "");
  await expect(honeypot).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("altcha-widget")).toHaveCount(0);
  expect(altchaScriptRequests).toBe(1);
});
