import type { AdminSettings } from "@/shared/contracts/admin";

import { AdminApiError, adminRequest, requestSessionLogin } from "./client";

async function backupError(response: Response) {
  if (response.status === 401) requestSessionLogin();
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new AdminApiError(
    response.status,
    typeof body.error === "string" ? body.error : "Backup request failed",
  );
}

function backupFilename(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="([^"]+)"/)?.[1] ?? "forman-backup.sqlite";
}

export function getSettings() {
  return adminRequest<AdminSettings>("/api/admin/v1/settings");
}

export function updateSettings(settings: Partial<Omit<AdminSettings, "smtp" | "updatedAt">>) {
  return adminRequest<AdminSettings>("/api/admin/v1/settings", {
    body: JSON.stringify(settings),
    method: "PUT",
  });
}

export type SmtpSettingsInput = { authentication?: boolean; from: string; fromName?: string; host: string; password?: string; port: number; encryption: "tls" | "starttls" | "none"; username?: string };
export type SmtpTestEmailInput = { smtp: SmtpSettingsInput; to: string };
export function updateSmtpSettings(settings: SmtpSettingsInput) { return adminRequest<AdminSettings["smtp"]>("/api/admin/v1/settings/smtp", { body: JSON.stringify(settings), method: "PUT" }); }
export function sendSmtpTestEmail(input: SmtpTestEmailInput) { return adminRequest<void>("/api/admin/v1/settings/smtp/test", { body: JSON.stringify(input), method: "POST" }); }

export async function downloadFullBackup(password?: string) {
  const response = await fetch("/api/admin/v1/backup/export", {
    body: JSON.stringify(password ? { password } : {}),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await backupError(response);
  const url = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement("a");
    anchor.download = backupFilename(response);
    anchor.href = url;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function restoreFullBackup(file: File, password?: string) {
  const body = new FormData();
  body.set("backup", file);
  if (password) body.set("password", password);
  const response = await fetch("/api/admin/v1/backup/restore", {
    body,
    credentials: "same-origin",
    method: "POST",
  });
  if (!response.ok) throw await backupError(response);
}
