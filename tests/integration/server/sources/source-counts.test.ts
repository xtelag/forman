import { expect, test, vi } from "vitest";
import { createTestDatabase } from "../../../helpers/database";
import { createSource, listSources } from "@/server/sources/source-service";
import { pages, submissions } from "@/server/db/schema";

test("returns total and rolling counts in one grouped query, including exact boundaries and empty sources", async () => {
  const database = createTestDatabase();
  try {
    const now = new Date("2026-09-23T12:00:00.000Z");
    const source = await createSource(database.db, {
      name: "Counts",
      type: "one-shot",
    });
    const empty = await createSource(database.db, {
      name: "Empty",
      type: "session",
    });
    const day = 86400000;
    const ages = [
      0,
      day,
      day + 1,
      7 * day,
      7 * day + 1,
      30 * day,
      30 * day + 1,
    ];
    database.db
      .insert(submissions)
      .values(
        ages.map((age, i) => ({
          id: "count-" + i,
          sourceId: source.id,
          payloadJson: "{}",
          createdAt: new Date(now.getTime() - age),
        })),
      )
      .run();
    database.db
      .insert(submissions)
      .values({
        id: "tie-z",
        sourceId: source.id,
        payloadJson: "{}",
        createdAt: now,
      })
      .run();
    database.db.insert(pages).values([
      { id: "page-1", pageId: "public-page-1", name: "Draft", createdAt: now, updatedAt: now, sourceId: source.id, enabled: false },
      { id: "page-2", pageId: "public-page-2", name: "Published", createdAt: now, updatedAt: now, sourceId: source.id, enabled: true },
    ]).run();
    const prepare = vi.spyOn(database.client, "prepare");
    const results = await listSources(database.db, now);
    expect(results.find((row) => row.id === source.id)).toMatchObject({
      pageCount: 2,
      totalSubmissionCount: 8,
      submissionsLast24Hours: 3,
      submissionsLast7Days: 5,
      submissionsLast30Days: 7,
      lastSubmission: { id: "tie-z", createdAt: now.toISOString() },
    });
    expect(results.find((row) => row.id === empty.id)).toMatchObject({
      pageCount: 0,
      totalSubmissionCount: 0,
      submissionsLast24Hours: 0,
      submissionsLast7Days: 0,
      submissionsLast30Days: 0,
    });
    const countQueries = prepare.mock.calls.filter(
      ([query]) =>
        query.includes('from "submission"') && query.includes("count("),
    );
    expect(countQueries).toHaveLength(1);
    prepare.mockRestore();
  } finally {
    database.dispose();
  }
});
