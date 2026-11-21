import { eq } from "drizzle-orm";
import { z } from "zod";

import type { createDatabase } from "@/server/db/client";
import { globalSettings } from "@/server/db/schema";
import { publicSettingsFields, settingsDocumentSchema, type SettingsDocument } from "./settings-document";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
// Remove defaults from PATCH fields: omitted keys must never reset saved values.
const globalSettingsUpdateSchema = z.object(
  Object.fromEntries(Object.entries(publicSettingsFields).map(([key, schema]) =>
    [key, schema.removeDefault().optional()],
  )) as { [K in keyof typeof publicSettingsFields]: z.ZodOptional<ReturnType<typeof publicSettingsFields[K]["removeDefault"]>> },
).strict();

function readSettingsRow(database: Pick<FormanDatabase, "select" | "insert">) {
  const existing = database.select().from(globalSettings).where(eq(globalSettings.id, "global")).get();
  if (existing) return existing;
  database.insert(globalSettings).values({ id: "global", updatedAt: new Date() })
    .onConflictDoNothing().run();
  const row = database.select().from(globalSettings)
    .where(eq(globalSettings.id, "global")).get();
  if (!row) throw new Error("Global settings could not be initialized");
  return row;
}

export function getGlobalSettings(database: FormanDatabase) {
  const row = readSettingsRow(database);
  return {
    ...settingsDocumentSchema.parse(row.configuration),
    id: row.id,
    adminPasswordResetFingerprint: row.adminPasswordResetFingerprint,
    updatedAt: row.updatedAt,
  };
}

/** Internal, validated mutation. Read and write happen under the same write lock. */
export function mutateSettingsDocument(
  database: FormanDatabase,
  update: (current: SettingsDocument) => Partial<SettingsDocument>,
) {
  return database.transaction((transaction) => {
    const row = readSettingsRow(transaction);
    const current = settingsDocumentSchema.parse(row.configuration);
    const configuration = settingsDocumentSchema.parse({ ...current, ...update(current) });
    transaction.update(globalSettings).set({ configuration, updatedAt: new Date() })
      .where(eq(globalSettings.id, row.id)).run();
    return configuration;
  }, { behavior: "immediate" });
}

export async function updateGlobalSettings(database: FormanDatabase, values: unknown) {
  const parsed = globalSettingsUpdateSchema.safeParse(values);
  if (!parsed.success) return false;
  try {
    mutateSettingsDocument(database, () => parsed.data);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) return false;
    throw error;
  }
}
