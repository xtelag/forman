import { z } from "zod";

const token = /\{\{(meta|payload)\.([A-Za-z0-9_.-]+)\}\}/g;
export function validateWebhookUrl(value: string) {
  const authority = /^https:\/\/[^/?#]+/.exec(value)?.[0];
  if (!authority || /[{}]/.test(authority)) throw new Error("Use a fixed HTTPS server and templates only in the path or query");
  const sample = value.replace(token, "value");
  if (/[{}]/.test(sample)) throw new Error("Invalid URL template");
  const url = new URL(sample);
  if (url.username || url.password || url.hash) throw new Error("URL credentials and fragments are not supported");
  return value;
}
export function renderWebhookUrl(value: string, meta: Record<string, unknown>, payload: Record<string, unknown>) {
  validateWebhookUrl(value);
  return value.replace(token, (_, group: string, key: string) => {
    const data = group === "meta" ? meta : payload;
    const field = Object.hasOwn(data, key) ? data[key] : undefined;
    if (!["string", "number", "boolean"].includes(typeof field) || field === "." || field === "..") throw new Error("URL template requires an existing scalar value");
    return encodeURIComponent(String(field));
  });
}
const schema = z.object({
  url: z.string().min(1), method: z.enum(["POST", "PUT", "PATCH", "DELETE", "GET", "HEAD"]).default("POST"),
  authentication: z.enum(["none", "bearer", "basic"]).optional(),
  bearerToken: z.string().optional(), username: z.string().optional(), password: z.string().optional(),
});
export function normalizeWebhookConfiguration(input: unknown, previous?: Record<string, unknown>) {
  const value = schema.parse(input);
  validateWebhookUrl(value.url);
  const authentication = value.authentication ?? (value.bearerToken || previous?.bearerToken ? "bearer" : "none");
  if (authentication === "bearer") {
    const bearerToken = value.bearerToken || previous?.bearerToken;
    if (typeof bearerToken !== "string" || !bearerToken || /[\r\n]/.test(bearerToken)) throw new Error("Bearer token is required");
    return {url:value.url, method:value.method, authentication, bearerToken};
  }
  if (authentication === "basic") {
    const password = value.password || previous?.password;
    if (!value.username || value.username.includes(":") || typeof password !== "string" || !password) throw new Error("Basic authentication requires username and password");
    return {url:value.url, method:value.method, authentication, username:value.username, password};
  }
  return {url:value.url, method:value.method, authentication};
}
export function webhookAuthorization(configuration: Record<string, unknown>): Record<string, string> {
  const mode = configuration.authentication ?? (configuration.bearerToken ? "bearer" : "none");
  if (mode === "basic") return {authorization:`Basic ${Buffer.from(`${configuration.username}:${configuration.password}`).toString("base64")}`};
  if (mode === "bearer") return {authorization:`Bearer ${configuration.bearerToken}`};
  return {};
}
