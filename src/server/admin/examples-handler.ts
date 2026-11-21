import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { createExample, processExample } from "@/server/dashboard/examples";
import { exampleInputSchema } from "@/shared/contracts/examples";

export function createAdminExamplesHandler({
  database,
}: {
  database: ReturnType<typeof createDatabase>["db"];
}) {
  return {
    async create(request: Request) {
      if (
        !(await getAdministratorSessionFromCookie(
          database,
          request.headers.get("cookie"),
        ))
      ) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const input = exampleInputSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!input.success)
        return Response.json({ error: "Invalid example" }, { status: 400 });
      const example = createExample(database, input.data);
      return Response.json(
        { ...example, sampleStatus: await processExample(database, example) },
        { status: 201 },
      );
    },
  };
}
