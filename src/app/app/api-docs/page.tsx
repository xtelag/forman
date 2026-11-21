import type { Metadata } from "next";
import { ApiDocsScreen } from "@/components/api-docs/api-docs-screen";

export const metadata: Metadata = { title: "API docs" };

export default function ApiDocsPage() {
  return <ApiDocsScreen />;
}
