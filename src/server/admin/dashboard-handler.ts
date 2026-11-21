import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";
import { getDashboardSummary } from "@/server/dashboard/summary";
import { getAdministratorInitialPasswordState } from "@/server/auth/login";
import type { AdminDashboardResponse } from "@/shared/contracts/admin";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function createAdminDashboardHandler({ database }: { database: FormanDatabase }) {
  return {
    async get(request: Request) {
      if (!(await getAdministratorSessionFromCookie(database, request.headers.get("cookie")))) return unauthorized();

      const [summary, administrator] = await Promise.all([
        getDashboardSummary(database),
        getAdministratorInitialPasswordState(database),
      ]);
      const response: AdminDashboardResponse = {
        isInitialPassword: administrator,
        summary: {
          ...summary,
          recentSubmissions: summary.recentSubmissions.map((submission) => ({
            ...submission,
            createdAt: submission.createdAt.toISOString(),
          })),
        },
      };
      return Response.json(response);
    },
  };
}
