import nodemailer from "nodemailer";
import { z } from "zod";

import type { createDatabase } from "@/server/db/client";
import type { AdminSmtpSettings } from "@/shared/contracts/admin";

import { getGlobalSettings, mutateSettingsDocument } from "./global-settings";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
const smtpSettingsSchema = z.object({ authentication: z.boolean().default(true), from: z.string().email(), fromName: z.string().trim().max(200).regex(/^[^\r\n]*$/, "From name must be a single line").optional(), host: z.string().min(1), password: z.string().min(1).optional(), port: z.number().int().min(1).max(65_535), encryption: z.enum(["tls", "starttls", "none"]), username: z.string().optional() }).refine(value => !value.authentication || Boolean(value.username?.trim()), { message: "Username is required when authentication is enabled", path: ["username"] });
const smtpTestEmailSchema = z.object({ smtp: smtpSettingsSchema, to: z.string().email() });
export type SmtpSettingsInput = z.infer<typeof smtpSettingsSchema>;
export type CompleteSmtpSettings = Omit<SmtpSettingsInput, "password"> & { password?: string };

function hasCompleteTransport(settings: Awaited<ReturnType<typeof getGlobalSettings>>) {
  return settings.smtpFrom !== null && settings.smtpHost !== null && settings.smtpPort !== null && settings.smtpEncryption !== null && (!settings.smtpAuthentication || (settings.smtpPassword !== null && settings.smtpUsername !== null));
}

export async function getSmtpSettings(database: FormanDatabase): Promise<AdminSmtpSettings> {
  const settings = await getGlobalSettings(database);
  return { authentication: settings.smtpAuthentication, fromName: settings.smtpFromName, from: settings.smtpFrom, host: settings.smtpHost, passwordConfigured: settings.smtpPassword !== null, port: settings.smtpPort, encryption: settings.smtpEncryption, status: hasCompleteTransport(settings) ? "ready" : "not-configured", username: settings.smtpUsername };
}

export async function saveSmtpSettings(database: FormanDatabase, values: unknown) {
  const input = smtpSettingsSchema.parse(values);
  mutateSettingsDocument(database, (settings) => {
    if (input.authentication && !input.password && !settings.smtpPassword)
      throw new Error("A password is required for SMTP setup");
    return {
      smtpAuthentication: input.authentication,
      smtpFromName: input.fromName === undefined ? settings.smtpFromName : input.fromName || null,
      smtpFrom: input.from, smtpHost: input.host,
      smtpPassword: input.password ?? settings.smtpPassword,
      smtpPort: input.port, smtpEncryption: input.encryption,
      smtpUsername: input.username ?? settings.smtpUsername,
    };
  });
  return getSmtpSettings(database);
}

export async function removeSmtpPassword(database: FormanDatabase) {
  mutateSettingsDocument(database, () => ({ smtpPassword: null }));
}

export async function getCompleteSmtpSettings(database: FormanDatabase): Promise<CompleteSmtpSettings | null> {
  const settings = await getGlobalSettings(database);
  if (!hasCompleteTransport(settings)) return null;
  return { authentication: settings.smtpAuthentication, fromName: settings.smtpFromName ?? undefined, from: settings.smtpFrom!, host: settings.smtpHost!, password: settings.smtpAuthentication ? settings.smtpPassword! : undefined, port: settings.smtpPort!, encryption: settings.smtpEncryption!, username: settings.smtpUsername! };
}

async function passwordForSmtpInput(database: FormanDatabase, input: SmtpSettingsInput) {
  if (!input.authentication) return undefined;
  const settings = await getGlobalSettings(database);
  if (input.password) return input.password;
  const sameTransport = input.from === settings.smtpFrom
    && input.host === settings.smtpHost
    && input.port === settings.smtpPort
    && input.encryption === settings.smtpEncryption
    && input.username === settings.smtpUsername;
  if (!sameTransport) {
    throw new Error("Enter the SMTP password before testing changed connection settings");
  }
  const password = settings.smtpPassword ?? undefined;
  if (!password) throw new Error("A password is required for SMTP setup");
  return password;
}

export async function sendSmtpTestEmail(database: FormanDatabase, values: unknown) {
  const input = smtpTestEmailSchema.parse(values);
  const password = await passwordForSmtpInput(database, input.smtp);
  await nodemailer.createTransport(smtpTransportOptions({ ...input.smtp, password })).sendMail({ from: smtpSender(input.smtp), subject: "Forman SMTP test email", text: "This is a test email sent by Forman.", to: input.to });
}

export function smtpTransportOptions(smtp: CompleteSmtpSettings) {
  return {
    ...(smtp.authentication !== false ? { auth: { pass: smtp.password!, user: smtp.username! } } : {}), host: smtp.host, port: smtp.port,
    secure: smtp.encryption === "tls",
    requireTLS: smtp.encryption === "starttls",
    ignoreTLS: smtp.encryption === "none",
  };
}

export type SmtpSender = string | { name: string; address: string };

export function smtpSender(smtp: Pick<SmtpSettingsInput, "from" | "fromName">): SmtpSender {
  return smtp.fromName ? { name: smtp.fromName, address: smtp.from } : smtp.from;
}
