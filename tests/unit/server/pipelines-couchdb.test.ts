import { expect, test, vi } from "vitest";
import { archiveToCouchDb } from "@/server/pipelines/couchdb-action";
const configuration = { url: "https://db.example.test", database: "forman", username: "forman", password: "secret" };
const document = { _id: "submission:one", version: 1, sourceId: "source", submissionId: "one", createdAt: "2026-09-16T00:00:00.000Z", payload: { name: "Test", choices: ["a", "b"] } };
test("archives using PUT and Basic auth without returning a payload patch", async () => {
  const send = vi.fn().mockResolvedValue({status:201,body:JSON.stringify({ok:true,id:document._id,rev:"1-a"})});
  await archiveToCouchDb(configuration, document, send);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({method:"PUT",url:"https://db.example.test/forman/submission%3Aone",body:JSON.stringify(document),headers:expect.objectContaining({authorization:`Basic ${Buffer.from("forman:secret").toString("base64")}`})}));
});
test("verifies a conflicting document before treating a retry as delivered", async () => {
  const send = vi.fn().mockResolvedValueOnce({status:409,body:""}).mockResolvedValueOnce({status:200,body:JSON.stringify({...document,_rev:"1-a"})});
  await archiveToCouchDb(configuration,document,send);
  expect(send.mock.calls[1][0].method).toBe("GET");
});
test("rejects conflicts with different data and never overwrites", async () => {
  const send = vi.fn().mockResolvedValueOnce({status:409,body:""}).mockResolvedValueOnce({status:200,body:JSON.stringify({...document,payload:{name:"Other"}})});
  await expect(archiveToCouchDb(configuration,document,send)).rejects.toThrow("CouchDB archive conflict");
  expect(send).toHaveBeenCalledTimes(2);
});
test.each([401,403,500])("rejects HTTP %i without exposing response bodies", async status => {
  await expect(archiveToCouchDb(configuration,document,vi.fn().mockResolvedValue({status,body:"secret internal detail"}))).rejects.toThrow("CouchDB archive request failed");
});
test("hides transport errors", async () => {
 await expect(archiveToCouchDb(configuration,document,vi.fn().mockRejectedValue(new Error("secret")))).rejects.toThrow("CouchDB connection failed");
});
test("rejects queued writes and malformed success receipts", async () => {
  for (const response of [{status:202,body:"{}"},{status:201,body:"invalid"},{status:201,body:JSON.stringify({ok:true,id:"other",rev:"1-a"})}]) {
    await expect(archiveToCouchDb(configuration,document,vi.fn().mockResolvedValue(response))).rejects.toThrow(/CouchDB archive/);
  }
});
test("accepts equivalent stored documents regardless of property order", async () => {
  const send=vi.fn().mockResolvedValueOnce({status:409,body:""}).mockResolvedValueOnce({status:200,body:JSON.stringify({_rev:"1-a",payload:{choices:["a","b"],name:"Test"},createdAt:document.createdAt,submissionId:"one",sourceId:"source",version:1,_id:"submission:one"})});
  await expect(archiveToCouchDb(configuration,document,send)).resolves.toBeUndefined();
});
