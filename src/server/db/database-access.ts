import { accessSync, constants, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

function processIdentity() {
  return typeof process.getuid === "function"
    ? "UID " + process.getuid() + ", GID " + process.getgid!()
    : "the current process user";
}

export function databaseAccessError(path: string, problem: string, cause?: unknown, directory = false) {
  return new Error(
    (directory ? "Data directory " : "Database file ") + JSON.stringify(resolve(path)) + " " + problem + " for " + processIdentity(),
    { cause },
  );
}

function inspect(path: string, directory: boolean, optional = false) {
  try {
    const info = statSync(/* turbopackIgnore: true */ path);
    if (directory ? !info.isDirectory() : !info.isFile())
      throw databaseAccessError(path, directory ? "is not a directory" : "is not a regular file", undefined, directory);
    accessSync(path, directory ? constants.W_OK | constants.X_OK : constants.R_OK | constants.W_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (optional && code === "ENOENT") return;
    if (!code) throw error;
    const reason = code === "ENOENT" ? "does not exist"
      : code === "EACCES" || code === "EPERM" ? "is not accessible"
      : code === "EROFS" ? "is on a read-only filesystem"
      : "access failed (" + code + ")";
    throw databaseAccessError(path, reason, error, directory);
  }
}

export function checkDatabaseAccess(databasePath: string) {
  if (databasePath === ":memory:") return;
  inspect(dirname(resolve(databasePath)), true);
  for (const path of [databasePath, databasePath + "-wal", databasePath + "-shm"])
    inspect(path, false, true);
}
