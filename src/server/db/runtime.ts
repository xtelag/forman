import { loadEnvironment } from "@/server/config/environment";

import { createDatabase } from "./client";

const globalForDatabase = globalThis as typeof globalThis & {
  formanDatabase?: ReturnType<typeof createDatabase>;
};

export function getRuntimeDatabase() {
  globalForDatabase.formanDatabase ??= createDatabase(loadEnvironment(process.env).databasePath);
  return globalForDatabase.formanDatabase;
}

export function closeRuntimeDatabase() {
  globalForDatabase.formanDatabase?.close();
  globalForDatabase.formanDatabase = undefined;
}
