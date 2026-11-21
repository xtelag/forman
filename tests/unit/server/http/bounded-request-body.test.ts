import { describe, expect, test, vi } from "vitest";

import {
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/server/http/bounded-request-body";

describe("readBoundedRequestText", () => {
  test("rejects an oversized declared length before reading the stream", async () => {
    const pull = vi.fn();
    const request = new Request("https://forman.example.test", {
      body: new ReadableStream({ pull }),
      duplex: "half",
      headers: { "content-length": "11" },
      method: "POST",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedRequestText(request, 10)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(request.bodyUsed).toBe(false);
  });

  test("cancels a chunked stream as soon as its byte limit is exceeded", async () => {
    const cancel = vi.fn();
    const request = new Request("https://forman.example.test", {
      body: new ReadableStream({
        cancel,
        start(controller) {
          controller.enqueue(new TextEncoder().encode("123456"));
          controller.enqueue(new TextEncoder().encode("789012"));
        },
      }),
      duplex: "half",
      method: "POST",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedRequestText(request, 10)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("accepts a body exactly at the byte limit", async () => {
    const request = new Request("https://forman.example.test", {
      body: "1234567890",
      method: "POST",
    });

    await expect(readBoundedRequestText(request, 10)).resolves.toBe("1234567890");
  });

  test("counts UTF-8 bytes instead of JavaScript characters", async () => {
    const request = new Request("https://forman.example.test", {
      body: "žluť",
      method: "POST",
    });

    await expect(readBoundedRequestText(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
