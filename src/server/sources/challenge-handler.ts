import type { Environment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import type { createDatabase } from "@/server/db/client";
import { createAltchaChallenge } from "@/server/anti-abuse/altcha";

import { findActiveSourceBySourceId, normalizeSourceId } from "./source-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type ChallengeDependencies = {
  database: FormanDatabase;
  environment: Environment;
};

export async function getChallengeResponse(
  { database, environment }: ChallengeDependencies,
  sourceId: string,
) {
  const normalizedSourceId = normalizeSourceId(sourceId);
  const source = await findActiveSourceBySourceId(database, normalizedSourceId);
  if (!source || source.type === "m2m") return Response.json({ error: "Source unavailable" }, { status: 503 });

  const settings = await getGlobalSettings(database);
  const challenge = await createAltchaChallenge({
    sourceId: normalizedSourceId,
    secret: environment.altchaSecret,
    ttlSeconds: settings.challengeTtlSeconds,
    workFactor: settings.altchaMaxNumber,
  });

  return Response.json(challenge);
}
