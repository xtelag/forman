import { describe, expect, test } from "vitest";

import { transformEnvelope } from "@/server/flows/jsonata-transform";

describe("transformEnvelope", () => {
  test("evaluates JSONata against the whole submission envelope", async () => {
    await expect(transformEnvelope({ meta: { client: { ip: "203.0.113.10" } }, payload: { email: "john@example.test" } }, '{"email": payload.email, "ip": meta.client.ip}')).resolves.toEqual({ email: "john@example.test", ip: "203.0.113.10" });
  });
});
