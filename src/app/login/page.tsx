import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = { title: "Login" };

type LoginPageProperties = { searchParams: Promise<{ error?: string; password?: string; session?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProperties) {
  const { error, password, session } = await searchParams;
  return <LoginScreen error={error === "invalid" ? error : undefined} passwordChanged={password === "changed"} sessionExpired={session === "expired"} />;
}
