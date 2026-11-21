import {
  closeSync,
  existsSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

export function maintenanceMarkerPath(databasePath: string) {
  return `${databasePath}.maintenance`;
}

export function isMaintenanceMode(databasePath: string) {
  return existsSync(maintenanceMarkerPath(databasePath));
}

export function enterMaintenanceMode(databasePath: string) {
  const marker = maintenanceMarkerPath(databasePath);
  let descriptor: number;
  try {
    descriptor = openSync(marker, "wx", 0o600);
    writeFileSync(descriptor, `${Date.now()}\n`, "utf8");
    closeSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("A backup restore is already in progress");
    }
    throw error;
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    try {
      unlinkSync(marker);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}
