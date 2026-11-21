import { administratorSessionPolicy } from "./session-policy";
import type { Environment } from "@/server/config/environment";
import type { createDatabase } from "@/server/db/client";

import { getTrustedClientIp } from "@/server/anti-abuse/client-ip";

import { LoginAttemptLimiter } from "./login-limiter";
import { loginAdministrator } from "./login";
import { serializeAdministratorSessionCookie } from "./sessions";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

type LoginHandlerDependencies = {
  database: FormanDatabase;
  environment: Environment;
  limiter?: LoginAttemptLimiter;
};

const invalidLoginLocation = "/login?error=invalid";

function loginFailure() {
  return new Response(null, {
    status: 303,
    headers: { location: invalidLoginLocation },
  });
}

export function createLoginHandler({
  database,
  environment,
  limiter = new LoginAttemptLimiter(),
}: LoginHandlerDependencies) {
  return async function handleLogin(request: Request) {
    const clientAddress =
      getTrustedClientIp(request.headers, environment.trustProxy) ??
      // A direct Next.js deployment does not expose a peer address through the
      // Request API. Keep a bounded global login bucket instead of rejecting
      // every valid login or trusting a user-supplied forwarding header.
      "unattributed-client";

    const formData = await request.formData();
    const username = formData.get("username");
    const password = formData.get("password");
    const submittedPassword = typeof password === "string" ? password : "";
    const passwordToVerify = username === "forman" ? submittedPassword : "";
    const token = await loginAdministrator(
      database,
      limiter,
      clientAddress,
      passwordToVerify,
    );
    const inline = request.headers.get("accept") === "application/json";
    if (!token)
      return inline
        ? Response.json(
            { error: "The username or password is invalid." },
            { status: 401 },
          )
        : loginFailure();

    const response = inline
      ? new Response(null, { status: 204 })
      : new Response(null, { status: 303, headers: { location: "/app" } });
    response.headers.set(
      "set-cookie",
      serializeAdministratorSessionCookie({
        secure: environment.baseOrigin.protocol === "https:",
        token,
        maxAgeSeconds:
          (await administratorSessionPolicy(database)).absoluteMs / 1000,
      }),
    );
    return response;
  };
}
