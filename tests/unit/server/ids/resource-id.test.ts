import { describe, expect, test } from "vitest";

import { createResourceId } from "@/server/ids/resource-id";

describe("createResourceId", () => {
  test("creates concise, unambiguous lowercase references", () => {
    const identifiers = Array.from({ length: 256 }, () => createResourceId());

    expect(identifiers).toHaveLength(new Set(identifiers).size);
    for (const identifier of identifiers) {
      expect(identifier).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{16}$/);
    }
  });
});
