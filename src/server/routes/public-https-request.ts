import { isIP } from "node:net";
import { request, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";

import {
  resolvePublicWebhookEndpoint,
  type ResolveWebhookHostname,
} from "./webhook-endpoint";

type StartHttpsRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

export type PublicHttpsRequestInput = {
  method?: "POST" | "PUT" | "PATCH" | "DELETE" | "GET" | "HEAD";
  body: string;
  headers: Record<string, string>;
  responseBodyLimit?: number;
  resolveHostname?: ResolveWebhookHostname;
  ssrfProtectionEnabled?: boolean;
  startRequest?: StartHttpsRequest;
  timeoutMs?: number;
  url: string;
};

function parseHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a public HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Enter a public HTTPS URL");
  }
  return url;
}

function pinnedLookup(address: string): NonNullable<RequestOptions["lookup"]> {
  const family = isIP(address);
  return (_hostname, _options, callback) => {
    callback(null, address, family);
  };
}

export async function requestPublicHttps({
  body,
  method = "POST",
  headers,
  responseBodyLimit,
  resolveHostname,
  ssrfProtectionEnabled = true,
  startRequest = request as StartHttpsRequest,
  timeoutMs = 10_000,
  url: value,
}: PublicHttpsRequestInput) {
  return new Promise<{ body?: string; status: number }>((resolve, reject) => {
    let outgoing: ClientRequest | undefined;
    let incoming: IncomingMessage | undefined;
    let settled = false;
    const finish = (result: { body?: string; status: number } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timeout = () => {
      const error = new Error("Webhook request timed out");
      finish(error);
      incoming?.destroy();
      outgoing?.destroy(error);
    };
    const deadline = setTimeout(timeout, timeoutMs);
    const connect = async () => {
      const endpoint = ssrfProtectionEnabled
        ? await resolvePublicWebhookEndpoint(value, resolveHostname)
        : { addresses: [], url: parseHttpsUrl(value) };
      if (settled) return;
      const address = endpoint.addresses[0];
      outgoing = startRequest(
        {
          headers: {
            ...headers,
            "content-length": String(Buffer.byteLength(body)),
          },
          hostname: endpoint.url.hostname,
          lookup: address ? pinnedLookup(address) : undefined,
          method,
          path: `${endpoint.url.pathname}${endpoint.url.search}`,
          port: endpoint.url.port || 443,
          servername: endpoint.url.hostname,
        },
        (response) => {
          incoming = response;
          if (settled) {
            response.destroy();
            return;
          }
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            response.destroy();
            finish(new Error(`Webhook redirect rejected: HTTP ${status}`));
            return;
          }
          if (responseBodyLimit === undefined) {
            response.destroy();
            finish({ status });
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > responseBodyLimit) {
              response.destroy();
              finish(
                new Error("Webhook response body exceeds the allowed size"),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.once("error", (error) => finish(error));
          response.once("end", () =>
            finish({ body: Buffer.concat(chunks).toString("utf8"), status }),
          );
        },
      );
      outgoing.setTimeout(timeoutMs, timeout);
      outgoing.once("error", (error) => finish(error));
      outgoing.end(body);
    };
    void connect().catch((error) =>
      finish(
        error instanceof Error ? error : new Error("Webhook request failed"),
      ),
    );
  });
}

export async function postWebhookHttps(input: PublicHttpsRequestInput) {
  const response = await requestPublicHttps(input);
  return { status: response.status };
}
