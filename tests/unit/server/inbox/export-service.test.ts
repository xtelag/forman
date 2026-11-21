import { describe, expect, test } from "vitest";

import { serializeInboxCsv } from "@/server/inbox/export-service";

describe("serializeInboxCsv", () => {
  test("exports stable metadata and the exact stored payload", () => {
    const csv = serializeInboxCsv([
      {
        createdAt: new Date("2026-08-24T06:00:00.000Z"),
        actionName: "Archive",
        id: "inbox-1",
        payloadJson: '{"email":"john@example.com","lines":["a","b"]}',
        sourceId: "source-internal",
        sourceName: "Contact",
        sourcePublicId: "contact",
        state: "archived",
        submissionId: "submission-1",
        tags: [{ color: "blue", id: "sales", name: "Sales" }],
      },
    ]);

    expect(csv).toBe(
      'id,metadata,payload\r\ninbox-1,"{""submissionId"":""submission-1"",""receivedAt"":""2026-08-24T06:00:00.000Z"",""state"":""archived"",""source"":{""id"":""contact"",""name"":""Contact""},""action"":{""name"":""Archive""},""tags"":[{""id"":""sales"",""name"":""Sales"",""color"":""blue""}]}","{""email"":""john@example.com"",""lines"":[""a"",""b""]}"',
    );
  });

  test("protects spreadsheet formulas in every column", () => {
    const csv = serializeInboxCsv([
      {
        createdAt: new Date("2026-08-24T06:00:00.000Z"),
        actionName: "Archive",
        id: "=1+1",
        payloadJson: "@payload",
        sourceId: null,
        sourceName: "Source",
        sourcePublicId: null,
        state: "unread",
        submissionId: null,
        tags: [],
      },
    ]);

    expect(csv.split("\r\n")[1]).toMatch(/^'=1\+1,/);
    expect(csv).toContain(",'@payload");
  });
});
