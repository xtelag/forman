import { createAdminBackupHandler } from "@/server/backup/admin-backup-handler";
import { loadEnvironment } from "@/server/config/environment";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/server/db/runtime";

export async function POST(request: Request) {
  const environment = loadEnvironment(process.env);
  return createAdminBackupHandler({
    databasePath: environment.databasePath,
    runtime: {
      close: closeRuntimeDatabase,
      current: getRuntimeDatabase,
      open: getRuntimeDatabase,
    },
  }).restore(request);
}
