import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";
import {
  handleFormspreeCompatibilityPreflight,
  handleFormspreeCompatibilitySubmission,
} from "@/server/submissions/formspree-compatibility-handler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  return handleFormspreeCompatibilitySubmission(
    {
      database: getRuntimeDatabase().db,
      environment: loadEnvironment(process.env),
    },
    sourceId,
    request,
  );
}

export async function OPTIONS(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  return handleFormspreeCompatibilityPreflight(
    {
      database: getRuntimeDatabase().db,
      environment: loadEnvironment(process.env),
    },
    sourceId,
    request,
  );
}
