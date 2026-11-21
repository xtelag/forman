import { isMaintenanceMode } from "@/server/backup/maintenance-mode";

// Shared by instrumentation and route bundles, including development reloads.
const runtime = globalThis as typeof globalThis & {
  formanBackgroundJobs?: Map<string, Set<Promise<void>>>;
};
const jobs = (runtime.formanBackgroundJobs ??= new Map());

export async function runBackgroundJob(
  databasePath: string,
  job: () => Promise<void>,
) {
  if (isMaintenanceMode(databasePath)) return;
  const active = jobs.get(databasePath) ?? new Set<Promise<void>>();
  jobs.set(databasePath, active);
  const pending = Promise.resolve().then(job);
  active.add(pending);
  try {
    await pending;
  } finally {
    active.delete(pending);
    if (active.size === 0) jobs.delete(databasePath);
  }
}

// Call after entering maintenance, which prevents new jobs from starting.
export async function drainBackgroundJobs(databasePath: string) {
  await Promise.allSettled([...(jobs.get(databasePath) ?? [])]);
}
