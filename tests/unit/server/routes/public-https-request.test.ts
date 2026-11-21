import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { Readable } from "node:stream";

import { describe, expect, test, vi } from "vitest";

import { postWebhookHttps, requestPublicHttps } from "@/server/routes/public-https-request";

function requestDouble(status: number, onOptions: (options: RequestOptions) => void) {
  let requestCount = 0;
  let timeout: (() => void) | undefined;
  const outgoing = new EventEmitter() as ClientRequest;
  outgoing.setTimeout = vi.fn((_milliseconds, callback) => {
    timeout = callback;
    return outgoing;
  });
  outgoing.destroy = vi.fn((error?: Error) => {
    if (error) queueMicrotask(() => outgoing.emit("error", error));
    return outgoing;
  });
  outgoing.end = vi.fn(() => outgoing);

  const startRequest = vi.fn((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    requestCount += 1;
    onOptions(options);
    const response = Object.assign(new Readable({ read() { this.push(null); } }), {
      statusCode: status,
    }) as IncomingMessage;
    queueMicrotask(() => callback(response));
    return outgoing;
  });

  return {
    outgoing,
    requestCount: () => requestCount,
    startRequest,
    triggerTimeout: () => timeout?.(),
  };
}

describe("postWebhookHttps", () => {
  test("pins the connection to an address that passed public validation", async () => {
    let options: RequestOptions | undefined;
    const fake = requestDouble(204, (value) => { options = value; });

    await expect(postWebhookHttps({
      body: "{}",
      headers: { "content-type": "application/json" },
      resolveHostname: async () => ["8.8.8.8"],
      startRequest: fake.startRequest,
      url: "https://crm.example.test/hook?event=created",
    })).resolves.toEqual({ status: 204 });

    expect(options).toMatchObject({
      hostname: "crm.example.test",
      method: "POST",
      path: "/hook?event=created",
      servername: "crm.example.test",
    });
    const lookup = options?.lookup;
    expect(lookup).toBeTypeOf("function");
    await expect(new Promise((resolve, reject) => {
      lookup?.("crm.example.test", {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    })).resolves.toEqual({ address: "8.8.8.8", family: 4 });
  });

  test("rejects redirects without issuing a second request", async () => {
    const fake = requestDouble(302, () => undefined);

    await expect(postWebhookHttps({
      body: "{}",
      headers: {},
      resolveHostname: async () => ["8.8.8.8"],
      startRequest: fake.startRequest,
      url: "https://crm.example.test/hook",
    })).rejects.toThrow("Webhook redirect rejected: HTTP 302");
    expect(fake.requestCount()).toBe(1);
  });

  test("destroys a stalled request after the fixed timeout", async () => {
    const fake = requestDouble(204, () => undefined);
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    fake.startRequest.mockImplementationOnce((options, callback) => {
      void options;
      void callback;
      markStarted?.();
      return fake.outgoing;
    });
    const pending = postWebhookHttps({
      body: "{}",
      headers: {},
      resolveHostname: async () => ["8.8.8.8"],
      startRequest: fake.startRequest,
      timeoutMs: 25,
      url: "https://crm.example.test/hook",
    });

    await started;
    fake.triggerTimeout();

    await expect(pending).rejects.toThrow("Webhook request timed out");
    expect(fake.outgoing.destroy).toHaveBeenCalledWith(expect.any(Error));
  });

  test("rejects a response body larger than the configured bound", async () => {
    const outgoing = new EventEmitter() as ClientRequest;
    outgoing.setTimeout = vi.fn(() => outgoing);
    outgoing.destroy = vi.fn(() => outgoing);
    outgoing.end = vi.fn(() => outgoing);
    const startRequest = vi.fn((_options: RequestOptions, callback: (response: IncomingMessage) => void) => {
      const response = Object.assign(Readable.from([Buffer.alloc(5)]), { statusCode: 200 }) as IncomingMessage;
      queueMicrotask(() => callback(response));
      return outgoing;
    });

    await expect(requestPublicHttps({
      body: "{}",
      headers: {},
      resolveHostname: async () => ["8.8.8.8"],
      responseBodyLimit: 4,
      startRequest,
      url: "https://hooks.example.test/hook",
    })).rejects.toThrow("Webhook response body exceeds the allowed size");
  });
});

test("bounds DNS resolution and never opens a request after the deadline", async () => {
  vi.useFakeTimers();
  try {
    let resolveDns!: (addresses: string[]) => void;
    const fake = requestDouble(200, () => undefined);
    const pending = requestPublicHttps({body:"",headers:{},url:"https://slow.example.test",timeoutMs:50,
      resolveHostname:()=>new Promise<string[]>(resolve=>{resolveDns=resolve}),startRequest:fake.startRequest});
    const result = pending.catch(error=>error);
    await vi.advanceTimersByTimeAsync(51);
    resolveDns(["8.8.8.8"]);
    expect(await result).toBeInstanceOf(Error);
    expect(fake.requestCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test("enforces a total deadline even while response data continues arriving", async () => {
  vi.useFakeTimers();
  try {
    const fake = requestDouble(200, () => undefined);
    const response = Object.assign(new Readable({read(){}}), {statusCode:200}) as IncomingMessage;
    fake.startRequest.mockImplementationOnce((_options, callback)=>{
      queueMicrotask(()=>callback(response));
      return fake.outgoing;
    });
    const pending = requestPublicHttps({body:"",headers:{},url:"https://slow.example.test",timeoutMs:50,
      responseBodyLimit:4096, resolveHostname:async()=>["8.8.8.8"],startRequest:fake.startRequest});
    const result = pending.catch(error=>error);
    for(let i=0;i<6;i++){ await vi.advanceTimersByTimeAsync(10); response.push(" "); }
    response.push(null);
    expect(await result).toBeInstanceOf(Error);
    expect(fake.outgoing.destroy).toHaveBeenCalled();
    expect(response.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
