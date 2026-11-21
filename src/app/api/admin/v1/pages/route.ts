import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { createAdminPagesHandler } from "@/server/pages/admin-pages-handler";

function handler() {
  const environment = loadEnvironment(process.env);
  return createAdminPagesHandler({
    baseUrl: environment.baseOrigin,
    database: getRuntimeDatabase().db,
  });
}

export async function GET(request: Request) {
  return handler().list(request);
}

export async function POST(request: Request) {
  return handler().create(request);
}
