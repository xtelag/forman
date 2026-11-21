import { afterEach, expect, test, vi } from "vitest";
import { listSubmissions, deleteSubmissionSelection } from "@/client/admin-api/submissions";
import { listInbox } from "@/client/admin-api/inbox";
import { listGlobalPipelineRuns, listWaitingCallbacks } from "@/client/admin-api/pipelines";
import { adminRequest } from "@/client/admin-api/client";
vi.mock("@/client/admin-api/client", () => ({ adminRequest: vi.fn() }));
const originalTZ = process.env.TZ;
afterEach(() => { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; vi.clearAllMocks(); });

test("all list requests and bulk deletion use identical browser-day bounds", () => {
  process.env.TZ = "Europe/Prague";
  const filter = { from: "2026-03-29", to: "2026-03-29" };
  listSubmissions(filter);
  listInbox("?from=2026-03-29&to=2026-03-29");
  listGlobalPipelineRuns(filter);
  listWaitingCallbacks(filter);
  for (const [url] of vi.mocked(adminRequest).mock.calls) {
    const params = new URL(String(url), "https://example.test").searchParams;
    expect(params.get("from")).toBe("2026-03-28T23:00:00.000Z");
    expect(params.get("to")).toBe("2026-03-29T22:00:00.000Z");
  }
  deleteSubmissionSelection({ type: "filter", filter, excludedIds: ["keep"], snapshotBefore: "2026-04-01T00:00:00.000Z" });
  const options = vi.mocked(adminRequest).mock.calls.at(-1)?.[1];
  expect(JSON.parse(String(options?.body))).toEqual({ type: "filter", filter: { from: "2026-03-28T23:00:00.000Z", to: "2026-03-29T22:00:00.000Z" }, excludedIds: ["keep"], snapshotBefore: "2026-04-01T00:00:00.000Z" });
});
