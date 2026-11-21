import { getAdministratorSessionToken } from "@/server/auth/request-auth";
import { administratorSessionPolicy } from "@/server/auth/session-policy";
import { loadEnvironment } from "@/server/config/environment";
import {
  getSession,
  serializeAdministratorSessionCookie,
} from "@/server/auth/sessions";
import { getRuntimeDatabase } from "@/server/db/runtime";
export async function POST(request: Request) {
  const token = getAdministratorSessionToken(request.headers.get("cookie"));
  const session = token
    ? await getSession(getRuntimeDatabase().db, token, new Date(), {
        touch: true,
      })
    : null;
  if (!session || !token)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { absoluteMs } = await administratorSessionPolicy(
    getRuntimeDatabase().db,
  );
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": serializeAdministratorSessionCookie({
        token,
        secure: loadEnvironment(process.env).baseOrigin.protocol === "https:",
        maxAgeSeconds:
          (session.createdAt.getTime() + absoluteMs - Date.now()) / 1000,
      }),
    },
  });
}
