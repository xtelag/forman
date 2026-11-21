import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SubmissionPayload } from "@/shared/contracts/submission";
import type { sendHttpActionRequest } from "./http-action";

export const couchDbConfigurationSchema = z.object({
  url: z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }, "Use an HTTPS server URL without credentials, query or fragment"),
  database: z.string().regex(/^[a-z][a-z0-9_$()+-]*$/, "Use a database name without slashes"),
  username: z.string().min(1).max(256).refine(value => !value.includes(":"), "Username cannot contain a colon"),
  password: z.string().min(1).max(4096),
});
export type CouchDbDocument = { _id: string; version: number; sourceId: string; submissionId: string; createdAt: string; payload: SubmissionPayload };

export async function archiveToCouchDb(configuration: z.infer<typeof couchDbConfigurationSchema>, document: CouchDbDocument, send: typeof sendHttpActionRequest) {
  const url = `${configuration.url.replace(/\/$/, "")}/${encodeURIComponent(configuration.database)}/${encodeURIComponent(document._id)}`;
  const headers = { authorization: `Basic ${Buffer.from(`${configuration.username}:${configuration.password}`).toString("base64")}`, "content-type": "application/json" };
  const request = async (method: "PUT" | "GET", body: string) => {
    try { return await send({ method, url, headers, body, responseBodyLimit: 2 * 1024 * 1024 }); }
    catch { throw new Error("CouchDB connection failed"); }
  };
  const response = await request("PUT", JSON.stringify(document));
  if (response.status === 409) {
    const existing = await request("GET", "");
    if (existing.status !== 200) throw new Error("CouchDB archive request failed");
    let value;
    try { value = JSON.parse(existing.body ?? ""); } catch { throw new Error("CouchDB archive response invalid"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CouchDB archive conflict");
    delete value._rev;
    if (!isDeepStrictEqual(value, document)) throw new Error("CouchDB archive conflict");
    return;
  }
  // 202 only confirms queuing, not the durable document write.
  if (response.status !== 201) throw new Error("CouchDB archive request failed");
  let receipt;
  try { receipt = JSON.parse(response.body ?? ""); } catch { throw new Error("CouchDB archive response invalid"); }
  if (receipt?.ok !== true || receipt.id !== document._id || typeof receipt.rev !== "string") throw new Error("CouchDB archive response invalid");
}
