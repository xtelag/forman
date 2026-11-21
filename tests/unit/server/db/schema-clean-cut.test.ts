import { describe, expect, test } from "vitest";

import * as schema from "@/server/db/schema";

describe("current database schema", () => {
  test("does not expose retired Hookchain, Destination, Delivery, or branch mappings", () => {
    expect(schema).not.toHaveProperty("hookchains");
    expect(schema).not.toHaveProperty("destinations");
    expect(schema).not.toHaveProperty("deliveries");
    expect(schema).not.toHaveProperty("hooks");
    expect(schema).toHaveProperty("pipelineRuns");
    expect(schema).toHaveProperty("pipelineActions");
    expect(schema).not.toHaveProperty("pipelineViews");
    expect(schema).not.toHaveProperty("inboxItems");
  });
});
