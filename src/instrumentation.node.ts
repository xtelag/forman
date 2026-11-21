import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { safeCleanupErrorLogContext } from "@/server/logging/redaction";
import { createStartupBootstrap } from "@/server/startup/bootstrap";
import { formatStartupFailure } from "@/server/startup/failure-reporting";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const PIPELINE_WORKER_INTERVAL_MS = 1_000;

const globalForStartup = globalThis as typeof globalThis & {
  formanStartup?: Promise<void>;
};

export async function registerNodeInstrumentation() {
  try {
    globalForStartup.formanStartup ??= (() => {
      const environment = loadEnvironment(process.env);
      const database = getRuntimeDatabase().db;

      const bootstrap = createStartupBootstrap({
        database,
        getDatabase: () => getRuntimeDatabase().db,
        environment,
        write: (value) => process.stdout.write(value + "\n"),
        scheduleCleanup: (job) => {
          const runCleanup = () => {
            void job().catch((error: unknown) => {
              console.error("Forman submission retention cleanup failed", safeCleanupErrorLogContext(error));
            });
          };

          runCleanup();
          const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
          timer.unref();
        },
        schedulePipelineWorker: (job) => {
          const runWorker = () => {
            void job().catch((error: unknown) => {
              console.error("Forman Pipeline worker failed", safeCleanupErrorLogContext(error));
            });
          };
          runWorker();
          const timer = setInterval(runWorker, PIPELINE_WORKER_INTERVAL_MS);
          timer.unref();
        },
      });
      return bootstrap.start();
    })();

    await globalForStartup.formanStartup;
  } catch (error) {
    process.stderr.write(`${formatStartupFailure(error)}\n`);
    process.exit(1);
  }
}
