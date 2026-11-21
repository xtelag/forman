import type { LucideIcon } from "lucide-react";
import { Files, FileText, History, Hourglass, Inbox, LayoutDashboard, PanelsTopLeft, Settings, Workflow } from "lucide-react";

export type ApplicationNavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export const workspaceNavigation: readonly ApplicationNavigationItem[] = [
  { href: "/app", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/app/inbox", icon: Inbox, label: "Inbox" },
];

export const dataProcessingNavigation: readonly ApplicationNavigationItem[] = [
  { href: "/app/submissions", icon: Files, label: "Submissions" },
  { href: "/app/pipeline-runs", icon: History, label: "Pipeline Runs" },
  { href: "/app/callbacks", icon: Hourglass, label: "Waiting Callbacks" },
];

export const configurationNavigation: readonly ApplicationNavigationItem[] = [
  { href: "/app/sources", icon: FileText, label: "Data Sources" },
  { href: "/app/pages", icon: PanelsTopLeft, label: "Built-in Forms" },
  { href: "/app/pipelines", icon: Workflow, label: "Pipelines" },
  { href: "/app/settings", icon: Settings, label: "Settings" },
];
