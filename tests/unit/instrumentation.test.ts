import { afterEach, describe, expect, test, vi } from "vitest";

const registerNodeInstrumentation = vi.fn();

vi.mock("../../src/instrumentation.node", () => ({ registerNodeInstrumentation }));

import { register } from "../../src/instrumentation";

describe("Next instrumentation registration", () => {
  const nextRuntime = process.env.NEXT_RUNTIME;

  afterEach(() => {
    if (nextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = nextRuntime;
    }

    registerNodeInstrumentation.mockReset();
  });

  test("starts Node instrumentation when Next omits its runtime marker", async () => {
    delete process.env.NEXT_RUNTIME;

    await register();

    expect(registerNodeInstrumentation).toHaveBeenCalledOnce();
  });
});
