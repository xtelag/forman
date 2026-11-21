import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const publicWebhookError = "Enter a public HTTPS URL";

export type ResolveWebhookHostname = (hostname: string) => Promise<string[]>;

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  return first === 0 || first === 10 || first === 100 && second >= 64 && second <= 127 || first === 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 0 || first === 192 && second === 168 || first >= 224;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:");
}

function isPublicIpAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isPrivateIpv6(address);
  return false;
}

export async function resolveWebhookHostname(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
}

function parsePublicHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(publicWebhookError);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) throw new Error(publicWebhookError);
  return url;
}

export async function resolvePublicWebhookEndpoint(value: string, resolve: ResolveWebhookHostname = resolveWebhookHostname) {
  const url = parsePublicHttpsUrl(value);
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname).catch(() => { throw new Error(publicWebhookError); });
  const allowsE2eFlashHook = process.env.FORMAN_E2E_TEST_RUNTIME === "playwright" && process.env.FORMAN_E2E_FLASH_HOOK_URL === value;
  if (addresses.length === 0 || (!allowsE2eFlashHook && addresses.some((address) => !isPublicIpAddress(address)))) throw new Error(publicWebhookError);
  return { addresses, url };
}

export async function assertPublicWebhookEndpoint(value: string, resolve: ResolveWebhookHostname = resolveWebhookHostname) {
  await resolvePublicWebhookEndpoint(value, resolve);
}
