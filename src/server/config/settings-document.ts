import { z } from "zod";

// Add optional settings here with defaults; adding a field requires no SQL migration.
export const publicSettingsFields = {
  adminSessionIdleDays: z.number().int().min(1).max(365).default(7),
  adminSessionAbsoluteDays: z.number().int().min(1).max(365).default(30),
  altchaMaxNumber: z.number().int().min(1).max(10_000_000).default(100_000),
  clientBurstLimit: z.number().int().min(1).max(100_000).default(3),
  clientRateLimitPerMinute: z.number().int().min(1).max(100_000).default(20),
  challengeRateLimitPerMinute: z.number().int().min(1).max(100_000).default(60),
  challengeTtlSeconds: z.number().int().min(60).max(86_400).default(1200),
  sourceRateLimitPerMinute: z.number().int().min(1).max(100_000).default(100),
  loginFailureLimit: z.number().int().min(1).max(100).default(5),
  loginFailureWindowSeconds: z.number().int().min(60).max(86_400).default(900),
  rateLimiterCapacity: z.number().int().min(100).max(100_000).default(10_000),
  rateLimiterTtlSeconds: z.number().int().min(60).max(86_400).default(3600),
  robotsTxt: z.string().max(100_000).default("User-agent: *\nDisallow: /\n"),
  submissionRateLimitPerMinute: z.number().int().min(1).max(100_000).default(5),
  formspreeCompatibilityEndpointEnabled: z.boolean().default(false),
  failedActionRetentionDays: z.number().int().min(1).max(36_500).default(30),
  inboxRetentionDays: z.number().int().min(1).max(36_500).default(365),
  webhookSsrfProtectionEnabled: z.boolean().default(true),
};

export const settingsDocumentSchema = z.object({
  ...publicSettingsFields,
  smtpHost: z.string().min(1).nullable().default(null),
  smtpPort: z.number().int().min(1).max(65_535).nullable().default(null),
  smtpEncryption: z.enum(["tls", "starttls", "none"]).default("tls"),
  smtpUsername: z.string().nullable().default(null),
  smtpFrom: z.string().email().nullable().default(null),
  smtpFromName: z.string().max(200).regex(/^[^\r\n]*$/).nullable().default(null),
  smtpAuthentication: z.boolean().default(true),
  smtpPassword: z.string().nullable().default(null),
}).strict().refine(value => value.adminSessionIdleDays <= value.adminSessionAbsoluteDays, {
  message: "The inactivity limit cannot exceed the maximum sign-in lifetime",
  path: ["adminSessionIdleDays"],
});
export type SettingsDocument = z.infer<typeof settingsDocumentSchema>;
