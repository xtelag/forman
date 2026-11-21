import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import { administratorSessionCookieName } from "@/server/auth/sessions";
import { loadEnvironment } from "@/server/config/environment";
import { getRuntimeDatabase } from "@/server/db/runtime";

import packageJson from "../../../package.json";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const environment = loadEnvironment(process.env);
  const secure = environment.baseOrigin.protocol === "https:";
  const cookieName = administratorSessionCookieName(secure);
  const token = cookieStore.get(cookieName)?.value;
  if (
    !(await getAdministratorSessionFromCookie(
      getRuntimeDatabase().db,
      token
        ? `${cookieName}=${encodeURIComponent(token)}`
        : null,
      { secure },
    ))
  )
    redirect("/login");
  return (
    <AppShell
      runtimeMode={environment.runtimeMode}
      version={packageJson.version}
    >
      {children}
    </AppShell>
  );
}
