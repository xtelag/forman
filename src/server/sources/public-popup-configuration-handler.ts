import type { createDatabase } from "@/server/db/client";

import { isBrowserRequestOriginAllowed } from "./cors";
import { findActiveSourceBySourceId, normalizeSourceId } from "./source-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type PublicPopupConfigurationDependencies = { database: FormanDatabase };

export type PublicPopupConfiguration = {
  altchaEnabled: boolean;
  honeypotEnabled: boolean;
  honeypotFieldNames: string[];
};

export async function getPublicPopupConfiguration(
  { database }: PublicPopupConfigurationDependencies,
  sourceId: string,
  origin: string | null,
) {
  const source = await findActiveSourceBySourceId(database, normalizeSourceId(sourceId));
  if (!source || source.type !== "one-shot")
    return Response.json({ error: "Source unavailable" }, { status: 503 });

  if (!isBrowserRequestOriginAllowed(source.allowedOrigins, origin)) {
    return new Response("Origin is not authorized", {
      status: 403,
      headers: { vary: "Origin" },
    });
  }

  const configuration: PublicPopupConfiguration = {
    altchaEnabled: source.altchaEnabled,
    honeypotEnabled: source.honeypotEnabled,
    honeypotFieldNames: source.honeypotFieldNames,
  };
  return Response.json(configuration);
}
