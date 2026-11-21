import type { loadEnvironment } from "@/server/config/environment";
import { getGlobalSettings } from "@/server/config/global-settings";
import type { createDatabase } from "@/server/db/client";
import {
  handleBrowserSubmissionPreflight,
  handleBrowserSubmissionRequest,
} from "@/server/submissions/browser-submission-request-handler";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type CompatibilityDependencies = {
  database: FormanDatabase;
  environment: ReturnType<typeof loadEnvironment>;
};

async function isEnabled(database: FormanDatabase) {
  return (await getGlobalSettings(database)).formspreeCompatibilityEndpointEnabled;
}

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function handleFormspreeCompatibilitySubmission(
  dependencies: CompatibilityDependencies,
  requestedSourceId: string,
  request: Request,
) {
  if (!(await isEnabled(dependencies.database))) return notFound();
  return handleBrowserSubmissionRequest(dependencies, requestedSourceId, request);
}

export async function handleFormspreeCompatibilityPreflight(
  dependencies: CompatibilityDependencies,
  requestedSourceId: string,
  request: Request,
) {
  if (!(await isEnabled(dependencies.database))) return notFound();
  return handleBrowserSubmissionPreflight(
    dependencies,
    requestedSourceId,
    request,
  );
}
