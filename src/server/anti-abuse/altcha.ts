import { createChallenge, extractParams, verifySolution } from "altcha-lib/v1";
import type { Payload } from "altcha-lib/v1/types";

type CreateAltchaChallengeInput = {
  sourceId: string;
  secret: string;
  ttlSeconds?: number;
  workFactor: number;
};

type VerifyAltchaChallengeInput = Omit<CreateAltchaChallengeInput, "workFactor"> & {
  payload: Payload;
};

export async function createAltchaChallenge({
  sourceId,
  secret,
  ttlSeconds = 20 * 60,
  workFactor,
}: CreateAltchaChallengeInput) {
  return createChallenge({
    algorithm: "SHA-256",
    expires: new Date(Date.now() + ttlSeconds * 1_000),
    hmacKey: secret,
    maxNumber: workFactor,
    params: { sourceId },
  });
}

export async function verifyAltchaChallenge({
  sourceId,
  payload,
  secret,
}: VerifyAltchaChallengeInput) {
  if (extractParams(payload).sourceId !== sourceId) {
    return false;
  }

  return verifySolution(payload, secret);
}
