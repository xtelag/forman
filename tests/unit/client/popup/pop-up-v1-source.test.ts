// @ts-expect-error -- jsdom is installed for Vitest but this project intentionally has no @types/jsdom dependency.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";

import { integrationFields } from "@/server/sources/integration-fields";
import { createPopupSourceSnippet } from "@/server/sources/integration-snippets";

import { popUpV1Source } from "@/client/popup/pop-up-v1-source";

type PopupConfig = {
  messages?: unknown;
  closeOnBackdrop?: boolean;
  buttonColor?: string;
  position?: string;
  animation?: string;
  autoOpen?: boolean;
  apiBaseUrl?: string;
  description?: string;
  fields: Array<Record<string, unknown>>;
  sourceId: string;
  preview?: boolean;
  submitLabel?: string;
  title?: string;
  trigger?: string;
};

const baseConfig: PopupConfig = {
  fields: [{ label: "Email", name: "email", required: true, type: "email" }],
  sourceId: "contact/form",
  title: "Contact us",
};

const doms: JSDOM[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadWidget(
  config: PopupConfig,
  options: {
    fetch?: ReturnType<typeof vi.fn>;
    html?: string;
  } = {},
) {
  const dom = new JSDOM(options.html ?? "<!doctype html><body></body>", {
    runScripts: "outside-only",
    url: "https://host.example.test/page",
  });
  doms.push(dom);

  const script = dom.window.document.createElement("script");
  script.src = "https://forman.example.test/public/pop-up-v1.js";
  Object.defineProperty(dom.window.document, "currentScript", { configurable: true, value: script });

  const fetch = options.fetch ?? vi.fn().mockResolvedValue({
    json: async () => ({ altchaEnabled: false, honeypotEnabled: false }),
    ok: true,
  });
  Object.defineProperty(dom.window, "fetch", { configurable: true, value: fetch });
  Object.assign(dom.window, { popupConfig: config });
  dom.window.eval(`
    window.forman = window.forman || function () {
      (forman.q = forman.q || []).push(arguments);
    };
    forman("create", popupConfig);
  `);

  dom.window.eval(popUpV1Source);
  await flush();

  return { document: dom.window.document, fetch, window: dom.window };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (doms.length > 0) doms.pop()?.window.close();
});

describe("pop-up-v1 browser source", () => {
  test("drains the pre-load queue, creates the default floating trigger, and requests encoded form capabilities", async () => {
    const { document, fetch } = await loadWidget(baseConfig);

    expect(document.querySelectorAll("[data-forman-floating-trigger]")).toHaveLength(1);
    expect(document.querySelector("[data-forman-floating-trigger]")).toHaveTextContent("Contact us");
    expect(fetch).toHaveBeenCalledWith("https://forman.example.test/api/submit/contact%2Fform");
  });

  test("uses apiBaseUrl when the widget is served from a different origin", async () => {
    const { fetch } = await loadWidget({ ...baseConfig, apiBaseUrl: "https://api.forman.example.test" });

    expect(fetch).toHaveBeenCalledWith("https://api.forman.example.test/api/submit/contact%2Fform");
  });

  test("opens an auto-opened test popup with server capabilities and submits normally", async () => {
    const post = deferred<{ json: () => Promise<{ success: boolean }>; ok: boolean }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ altchaEnabled: false, honeypotEnabled: false }), ok: true })
      .mockReturnValueOnce(post.promise);
    const { document, window } = await loadWidget({ ...baseConfig, autoOpen: true }, { fetch });

    expect(fetch).toHaveBeenCalledWith("https://forman.example.test/api/submit/contact%2Fform");
    expect(document.querySelector("[data-forman-floating-trigger]")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toHaveAttribute("data-forman-open", "true");
    document.querySelector<HTMLFormElement>("[data-forman-form]")!
      .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    expect(document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Sending");
    post.resolve({ json: async () => ({ success: true }), ok: true });
    await flush();
    expect(document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Response submitted.");
  });

  test("connects exactly one selector trigger without adding a floating trigger", async () => {
    const { document, window } = await loadWidget(
      { ...baseConfig, trigger: "#host-contact" },
      { html: '<!doctype html><body><button id="host-contact">Host contact</button></body>' },
    );

    expect(document.querySelector("[data-forman-floating-trigger]")).toBeNull();
    const hostTrigger = document.querySelector<HTMLButtonElement>("#host-contact")!;
    hostTrigger.click();
    expect(document.querySelector('[role="dialog"]')).toHaveAttribute("data-forman-open", "true");
    expect(window.document.activeElement).not.toBe(hostTrigger);
  });

  test("revalidates a selector after capability loading and leaves no partial widget when it becomes ambiguous", async () => {
    const capabilities = deferred<{ json: () => Promise<{ altchaEnabled: boolean; honeypotEnabled: boolean }>; ok: boolean }>();
    const fetch = vi.fn().mockReturnValue(capabilities.promise);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { document } = await loadWidget(
      { ...baseConfig, trigger: ".host-contact" },
      { fetch, html: '<!doctype html><body><button class="host-contact">Host contact</button></body>' },
    );
    const duplicate = document.createElement("button");
    duplicate.className = "host-contact";
    document.body.appendChild(duplicate);

    capabilities.resolve({
      json: async () => ({ altchaEnabled: false, honeypotEnabled: false }),
      ok: true,
    });
    await flush();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatch(/trigger must match exactly one element/);
    expect(document.querySelector("[data-forman-widget]")).toBeNull();
    expect(document.querySelector("#forman-popup-v1-styles")).toBeNull();
  });

  test.each(["title", "submitLabel"] as const)("rejects a whitespace-only %s before fetching capabilities", async (label) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { document, fetch } = await loadWidget({ ...baseConfig, [label]: "   " });

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain(label + " must be non-empty text");
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector("[data-forman-widget]")).toBeNull();
  });

  test("renders every documented v1 field type", async () => {
    const { document } = await loadWidget({
      sourceId: "fields",
      title: "All fields",
      fields: [
        { label: "Name", name: "name", type: "text" },
        { label: "Email", name: "email", type: "email" },
        { label: "Count", name: "count", type: "number" },
        { label: "Message", name: "message", type: "textarea" },
        { label: "Topic", name: "topic", options: [{ label: "Support", value: "support" }], type: "select" },
        { label: "Agree", name: "agree", type: "checkbox", value: "yes" },
        { label: "Priority", name: "priority", options: [{ label: "High", value: "high" }], type: "radio" },
        { name: "source", type: "hidden", value: "popup" },
      ],
    });

    expect(document.querySelector('input[name="name"][type="text"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"][type="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="count"][type="number"]')).not.toBeNull();
    expect(document.querySelector('textarea[name="message"]')).not.toBeNull();
    expect(document.querySelector('select[name="topic"] option[value="support"]')).toHaveTextContent("Support");
    expect(document.querySelector('input[name="agree"][type="checkbox"][value="yes"]')).not.toBeNull();
    expect(document.querySelector('input[name="priority"][type="radio"][value="high"]')).not.toBeNull();
    expect(document.querySelector('input[name="source"][type="hidden"][value="popup"]')).not.toBeNull();
  });

  test("keeps field control IDs distinct from the dialog title ID", async () => {
    const { document } = await loadWidget({
      fields: [{ label: "Subject", name: "title", type: "text" }],
      sourceId: "distinct-ids",
      title: "Send a message",
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const titleId = dialog.getAttribute("aria-labelledby")!;
    const input = document.querySelector<HTMLInputElement>('input[name="title"]')!;
    const label = document.querySelector<HTMLLabelElement>('label[data-forman-label]')!;
    expect(document.querySelectorAll(`[id="${titleId}"]`)).toHaveLength(1);
    expect(input.id).not.toBe(titleId);
    expect(label.htmlFor).toBe(input.id);
  });

  test("rejects an invalid configuration once with an actionable console error and no partial widget", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { document, fetch } = await loadWidget({
      fields: [
        { label: "First", name: "duplicate", type: "text" },
        { label: "Second", name: "duplicate", type: "unsupported" },
      ],
      sourceId: "invalid",
    });

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatch(/Forman popup configuration:/);
    expect(document.querySelector("[data-forman-widget]")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("renders all host-provided labels and values as text, never markup", async () => {
    const markup = '<img src=x onerror="window.hacked=true">';
    const { document, window } = await loadWidget({
      description: markup,
      fields: [{ label: markup, name: "choice", options: [{ label: markup, value: markup }], type: "select" }],
      sourceId: "safe",
      title: markup,
    });

    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).toContain(markup);
    expect(document.querySelector("option")).toHaveAttribute("value", markup);
    expect((window as unknown as { hacked?: boolean }).hacked).not.toBe(true);
  });

  test("opens a labelled modal, closes on Escape, and restores focus to its trigger", async () => {
    const { document, window } = await loadWidget(baseConfig);
    const trigger = document.querySelector<HTMLButtonElement>("[data-forman-floating-trigger]")!;
    trigger.focus();
    trigger.click();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title).toHaveTextContent("Contact us");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-forman-open", "true");

    document.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(dialog).toHaveAttribute("data-forman-open", "false");
    expect(document.activeElement).toBe(trigger);
  });

  test("keeps focus inside the open dialog when Tab reaches either edge", async () => {
    const { document, window } = await loadWidget(baseConfig);
    document.querySelector<HTMLButtonElement>("[data-forman-floating-trigger]")!.click();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0] as HTMLElement;
    const last = focusable.at(-1) as HTMLElement;

    last.focus();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(last);
  });

  test("shows one loading state and then one success state without navigation", async () => {
    const post = deferred<{ json: () => Promise<{ success: boolean }>; ok: boolean }>();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ altchaEnabled: false, honeypotEnabled: false }), ok: true })
      .mockReturnValueOnce(post.promise);
    const { document, window } = await loadWidget(baseConfig, { fetch });
    document.querySelector<HTMLButtonElement>("[data-forman-floating-trigger]")!.click();
    const form = document.querySelector<HTMLFormElement>("[data-forman-form]")!;
    const initialUrl = window.location.href;
    const submitEvent = new window.Event("submit", { bubbles: true, cancelable: true });
    expect(form.dispatchEvent(submitEvent)).toBe(false);
    expect(submitEvent.defaultPrevented).toBe(true);
    await flush();

    expect(document.querySelectorAll('[data-forman-state]:not([hidden])')).toHaveLength(1);
    expect(document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Sending");
    expect(fetch.mock.calls[1]?.[0]).toBe("https://forman.example.test/api/submit/contact%2Fform");
    const postOptions = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(postOptions.method).toBe("POST");
    expect(postOptions.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(postOptions.body).toBeInstanceOf(window.URLSearchParams);
    expect(postOptions).not.toHaveProperty("credentials");
    expect(window.location.href).toBe(initialUrl);

    post.resolve({ json: async () => ({ success: true }), ok: true });
    await flush();
    expect(document.querySelectorAll('[data-forman-state]:not([hidden])')).toHaveLength(1);
    expect(document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Response submitted.");
    expect(window.location.href).toBe(initialUrl);
  });

  test("shows a safe response error and falls back to the generic error for malformed responses", async () => {
    const safeErrorFetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ altchaEnabled: false, honeypotEnabled: false }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ error: "Payload too large" }), ok: false });
    const safe = await loadWidget(baseConfig, { fetch: safeErrorFetch });
    safe.document.querySelector<HTMLButtonElement>("[data-forman-floating-trigger]")!.click();
    safe.document.querySelector<HTMLFormElement>("[data-forman-form]")!
      .dispatchEvent(new safe.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(safe.document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Payload too large");

    const malformedFetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ altchaEnabled: false, honeypotEnabled: false }), ok: true })
      .mockResolvedValueOnce({ json: async () => ({ nope: true }), ok: false });
    const malformed = await loadWidget({ ...baseConfig, sourceId: "malformed" }, { fetch: malformedFetch });
    malformed.document.querySelector<HTMLButtonElement>("[data-forman-floating-trigger]")!.click();
    malformed.document.querySelector<HTMLFormElement>("[data-forman-form]")!
      .dispatchEvent(new malformed.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(malformed.document.querySelector('[data-forman-state]:not([hidden])')).toHaveTextContent("Unable to submit");
  });

  test("adds only the protections enabled by the server capability response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ altchaEnabled: true, honeypotEnabled: true, honeypotFieldNames:["work_extension"] }),
      ok: true,
    });
    const { document } = await loadWidget({ ...baseConfig, sourceId: "protected/form" }, { fetch });

    expect(document.querySelector('input[name="work_extension"]')).not.toBeNull();
    expect(document.querySelector('altcha-widget[name="altcha"]')).toHaveAttribute(
      "challengeurl",
      "https://forman.example.test/api/challenge/protected%2Fform",
    );
    expect(document.querySelector('script[src="https://forman.example.test/vendor/altcha/altcha.js"]')).not.toBeNull();
  });
});

function generatedConfig(): PopupConfig {
  const model = integrationFields(JSON.stringify({type:"object",properties:{
    consent:{type:"boolean"}, amount:{type:"number"}, count:{type:"integer"},
    topics:{type:"array",items:{type:"string"}}, email:{type:"string",format:"email"},
    choice:{type:"string",enum:["first","second"]}
  }, required:["consent"],additionalProperties:false}));
  const snippet = createPopupSourceSnippet({sourceName:"Contact survey",sourceId:"typed",popupScriptUrl:"https://forman.test/popup.js",fields:model.fields});
  return {sourceId:"typed",title:JSON.parse(snippet.match(/  title: (.+),/)![1]),fields:JSON.parse(snippet.match(/fields: (\[.*\])/)![1])};
}

test("generated popup preserves boolean and array values and omits blank optional controls", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({altchaEnabled:false,honeypotEnabled:true,honeypotFieldNames:["company"]})})
    .mockResolvedValue({ok:true,json:async()=>({success:true})});
  const {document,window} = await loadWidget(generatedConfig(),{fetch});
  const form = document.querySelector<HTMLFormElement>("[data-forman-form]")!;
  const consent = form.elements.namedItem("consent") as HTMLInputElement;
  const topics = form.elements.namedItem("topics") as HTMLTextAreaElement;
  const amount = form.elements.namedItem("amount") as HTMLInputElement;
  const count = form.elements.namedItem("count") as HTMLInputElement;
  expect(consent.required).toBe(false);
  expect(topics.tagName).toBe("TEXTAREA");
  expect(amount.step).toBe("any");
  expect(count.step).toBe("1");
  amount.value = "1.5";
  expect(amount.validity.stepMismatch).toBe(false);
  topics.value = '["forms","surveys"]';
  consent.checked = true;
  form.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));
  await flush();
  expect(Object.fromEntries(fetch.mock.calls[1][1].body)).toEqual({consent:"true",amount:"1.5",topics:'["forms","surveys"]',company:""});
  form.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));
  await flush();
  expect(Object.fromEntries(fetch.mock.calls[2][1].body)).toEqual({consent:"false",company:""});
});

test("generated popup offers enum options without silently selecting an optional value",async()=>{
  const {document} = await loadWidget(generatedConfig());
  const choice = document.querySelector<HTMLSelectElement>('select[name="choice"]')!;
  expect(choice).not.toBeNull();
  expect(choice.value).toBe("");
  expect(Array.from(choice.options as HTMLOptionsCollection).map(option=>option.value)).toEqual(["","first","second"]);
});

test("popup keeps answers after 403, resets proof, and sends every trap", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({altchaEnabled:true,honeypotEnabled:true,honeypotFieldNames:["company","website"]})})
    .mockResolvedValue({ok:false,status:403,json:async()=>({error:"Rejected"})});
  const {document,window} = await loadWidget(baseConfig,{fetch});
  const form = document.querySelector<HTMLFormElement>("form")!;
  const email = form.elements.namedItem("email") as HTMLInputElement; email.value = "ada@example.test";
  const proof = document.createElement("input"); proof.name="altcha"; proof.value="expired"; form.append(proof);
  const reset=vi.fn(()=>{proof.value="";});Object.assign(form.querySelector("altcha-widget")!,{reset});
  form.dispatchEvent(new window.Event("submit",{cancelable:true}));await flush();
  expect(Object.fromEntries(fetch.mock.calls[1][1].body)).toMatchObject({company:"",website:"",altcha:"expired"});
  expect(reset).toHaveBeenCalledOnce();expect(email.value).toBe("ada@example.test");
  expect(document.querySelector('[data-forman-state]')).toHaveTextContent("Complete verification again");
  form.dispatchEvent(new window.Event("submit",{cancelable:true}));await flush();expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(["missing","duplicate","filled"])("popup rejects %s trap before sending",async mode=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({altchaEnabled:false,honeypotEnabled:true,honeypotFieldNames:["trap"]})});
  const {document,window}=await loadWidget(baseConfig,{fetch});const form=document.querySelector<HTMLFormElement>("form")!;
  const trap=form.elements.namedItem("trap") as HTMLInputElement;
  if(mode==="missing")trap.remove();else if(mode==="duplicate")trap.after(trap.cloneNode());else trap.value="bot";
  form.dispatchEvent(new window.Event("submit",{cancelable:true}));await flush();expect(fetch).toHaveBeenCalledTimes(1);
});

test("popup exposes position and animation while rendering accessible plain-text copy", async () => {
  const {document}=await loadWidget({...baseConfig,autoOpen:true,position:"bottom-right",animation:"slide",title:"<b>Contact</b>",description:"<i>Details</i>"});
  expect(document.querySelector("[data-forman-overlay]")).toHaveAttribute("data-forman-position","bottom-right");
  const dialog=document.querySelector('[role="dialog"]')!;
  expect(dialog).toHaveAttribute("data-forman-animation","slide");
  expect(document.querySelector("[data-forman-title]")).toHaveTextContent("<b>Contact</b>");
  expect(dialog.querySelector("b,i")).toBeNull();
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)).toHaveTextContent("<i>Details</i>");
});
test("popup defaults to bottom-right slide and omits blank descriptions", async () => {
  const {document}=await loadWidget({...baseConfig,description:"  "});
  expect(document.querySelector("[data-forman-overlay]")).toHaveAttribute("data-forman-position","bottom-right");
  expect(document.querySelector('[role="dialog"]')).toHaveAttribute("data-forman-animation","slide");
  expect(document.querySelector("[data-forman-description]")).toBeNull();
});
test.each([{position:"top"},{animation:"bounce"}])("rejects unsupported presentation choices %j",async option=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const {document,fetch}=await loadWidget({...baseConfig,...option});
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([undefined,"#ffffff","#123456"])("shares button color %s between trigger and submit",async buttonColor=>{
 const {document}=await loadWidget({...baseConfig,buttonColor});
 const trigger=document.querySelector('[data-forman-floating-trigger]') as HTMLElement;
 const submit=document.querySelector('[data-forman-submit]') as HTMLElement;
 expect(trigger.style.backgroundColor).toBe(submit.style.backgroundColor);
 expect(trigger.style.backgroundColor).toBe(buttonColor==="#ffffff"?"rgb(255, 255, 255)":buttonColor==="#123456"?"rgb(18, 52, 86)":"rgb(89, 74, 165)");
 expect(submit.style.color).toBe(buttonColor==="#ffffff"?"rgb(0, 0, 0)":"rgb(255, 255, 255)");
});
test("colors a custom trigger and rejects CSS instead of a hex color",async()=>{
 const {document}=await loadWidget({...baseConfig,trigger:"#open",buttonColor:"#123456"},{html:'<button id="open">Open</button>'});
 expect((document.querySelector('#open') as HTMLElement).style.backgroundColor).toBe("rgb(18, 52, 86)");
 vi.spyOn(console,"error").mockImplementation(()=>{});
 const invalid=await loadWidget({...baseConfig,buttonColor:"red; background:url(test)"});
 expect(invalid.fetch).not.toHaveBeenCalled();
});

test("backdrop closes by default, retains answers, restores focus and consumes the click",async()=>{
 const {document,window}=await loadWidget(baseConfig);
 const trigger=document.querySelector('[data-forman-floating-trigger]') as HTMLButtonElement;
 trigger.click();
 const field=document.querySelector('[data-forman-control]') as HTMLInputElement;
 field.value="test@example.test";
 const overlay=document.querySelector('[data-forman-overlay]') as HTMLElement;
 const bubbled=vi.fn();document.body.addEventListener("click",bubbled);
 overlay.dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true,button:0}));
 overlay.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}));
 expect(overlay.hidden).toBe(true);expect(bubbled).not.toHaveBeenCalled();
 expect(document.activeElement).toBe(trigger);
 trigger.click();expect(field.value).toBe("test@example.test");expect(overlay.hidden).toBe(false);
});
test.each([false,true])("backdrop respects opt-out and drag origins (%s)",async closeOnBackdrop=>{
 const {document,window}=await loadWidget({...baseConfig,autoOpen:true,closeOnBackdrop});
 const overlay=document.querySelector('[data-forman-overlay]') as HTMLElement;
 const field=document.querySelector('[data-forman-control]') as HTMLElement;
 field.dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true,button:0}));
 overlay.dispatchEvent(new window.MouseEvent("click",{bubbles:true}));
 expect(overlay.hidden).toBe(false);
 overlay.dispatchEvent(new window.MouseEvent("pointerdown",{bubbles:true,button:0}));
 overlay.dispatchEvent(new window.MouseEvent("click",{bubbles:true}));
 expect(overlay.hidden).toBe(closeOnBackdrop);
});


test("custom messages merge with defaults and render plain text", async () => {
  const { document, window } = await loadWidget({ ...baseConfig, preview: true, messages: { close: "Zavřít", submit: "Odeslat", preview: "<b>Náhled</b>" } });
  expect(document.querySelector("[data-forman-close]")).toHaveAttribute("aria-label", "Zavřít");
  expect(document.querySelector("[data-forman-submit]")).toHaveTextContent("Odeslat");
  document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  expect(document.querySelector("[data-forman-state]")!.textContent).toBe("<b>Náhled</b>");
  expect(document.querySelector("[data-forman-state] b")).toBeNull();
});

test.each([null, [], { typo: "text" }, { success: " " }, { error: 1 }])("rejects invalid message dictionaries %j", async messages => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { document, fetch } = await loadWidget({ ...baseConfig, messages });
  expect(document.querySelector("[data-forman-widget]")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  [200, { success: true }, "Hotovo"],
  [403, { error: "Verification failed" }, "Ověření selhalo"],
  [400, { error: "Server English error" }, "Chyba"],
])("localizes submission status %s", async (status, payload, expected) => {
  const post = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ altchaEnabled: false, honeypotEnabled: false }) }).mockReturnValueOnce(post.promise);
  const { document, window } = await loadWidget({ ...baseConfig, messages: { sending: "Odesílání", success: "Hotovo", error: "Chyba", verificationFailed: "Ověření selhalo" } }, { fetch });
  expect(document.querySelector("[data-forman-submit]")).toHaveTextContent("Submit");
  document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  expect(document.querySelector("[data-forman-state]")).toHaveTextContent("Odesílání");
  post.resolve({ ok: status === 200, status, json: async () => payload });
  await flush();
  expect(document.querySelector("[data-forman-state]")).toHaveTextContent(expected);
});

test("preserves explicit submitLabel precedence", async () => {
  const { document } = await loadWidget({ ...baseConfig, submitLabel: "Legacy", messages: { submit: "New" } });
  expect(document.querySelector("[data-forman-submit]")).toHaveTextContent("Legacy");
});


test.each([undefined, "", "   "])("requires an explicit non-empty title (%j)", async title => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { document, fetch } = await loadWidget({ ...baseConfig, title });
  expect(document.querySelector("[data-forman-widget]")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
