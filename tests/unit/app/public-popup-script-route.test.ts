import { describe, expect, test } from "vitest";

import { GET } from "@/app/public/pop-up-v1.js/route";
import { popUpV1Source } from "@/client/popup/pop-up-v1-source";

describe("GET /public/pop-up-v1.js", () => {
  test("serves the self-contained versioned widget with its immutable script contract", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(popUpV1Source);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
