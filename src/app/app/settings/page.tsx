import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata: Metadata = { title: "Settings" };

type SettingsPageProperties = { searchParams: Promise<{ error?: string }> };

export default async function SettingsPage({ searchParams }: SettingsPageProperties) {
  const query = await searchParams;
  return <SettingsScreen passwordError={query.error === "password"} />;
}
