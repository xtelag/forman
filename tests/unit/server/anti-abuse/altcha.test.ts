import { describe, expect, test, vi } from "vitest";

import { solveChallenge } from "altcha-lib/v1";

import { createAltchaChallenge, verifyAltchaChallenge } from "@/server/anti-abuse/altcha";

describe("ALTCHA", () => {
  test("uses the configured challenge lifetime", async () => {
    const secret = "an-altcha-secret-that-is-at-least-thirty-two-chars";
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const challenge = await createAltchaChallenge({
      sourceId: "form-a",
      secret,
      ttlSeconds: 90,
      workFactor: 1,
    });

    const solution = await solveChallenge(
      challenge.challenge,
      challenge.salt,
      challenge.algorithm,
      challenge.maxnumber,
    ).promise;

    vi.setSystemTime(now + 90_001);
    await expect(
      verifyAltchaChallenge({
        sourceId: "form-a",
        payload: { ...challenge, ...solution! },
        secret,
      }),
    ).resolves.toBe(false);
    vi.useRealTimers();
  });

  test("binds a solved challenge to its form and rejects a different form", async () => {
    const secret = "an-altcha-secret-that-is-at-least-thirty-two-chars";
    const challenge = await createAltchaChallenge({ sourceId: "form-a", secret, workFactor: 1 });
    const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
    const payload = { ...challenge, ...solution! };

    expect(solution).not.toBeNull();
    await expect(
      verifyAltchaChallenge({ sourceId: "form-a", payload, secret }),
    ).resolves.toBe(true);
    await expect(
      verifyAltchaChallenge({ sourceId: "form-b", payload, secret }),
    ).resolves.toBe(false);
  });
});
