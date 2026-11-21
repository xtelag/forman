import { z } from "zod";
import { systemTextsSchema } from "@/shared/system-texts";
const httpsUrl = z.string().max(2048).url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "Use an HTTPS URL without credentials.");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color.");
export const defaultPageTheme = { background: "#f4f4f5", surface: "#ffffff", text: "#18181b", button: "#6d28d9", buttonText: "#ffffff", width: 640, radius: 8 };
export const pagePresentationSchema = z.object({
  systemTexts: systemTextsSchema.optional(),
  language: z.enum(["en", "cs"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  successText: z.string().trim().max(1000).optional(),
  successUrl: httpsUrl.optional(),
  logoUrl: httpsUrl.optional(),
  logoAlt: z.string().trim().max(200).optional(),
  qrCaption: z.string().trim().max(75).optional(),
  theme: z.object({ background: color.optional(), surface: color.optional(), text: color.optional(), button: color.optional(), buttonText: color.optional(), width: z.number().int().min(480).max(960).optional(), radius: z.union([z.literal(0), z.literal(8), z.literal(16)]).optional() }).strict().optional(),
  fallbacks: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/), z.string().max(200)).optional(),
  steps: z.array(z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), title: z.string().trim().max(120) }).strict()).min(1).max(100).optional(),
  fields: z.array(z.object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/),
    step: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    label: z.string().trim().min(1).max(200).optional(), helpText: z.string().trim().max(500).optional(),
    placeholder: z.string().trim().max(200).optional(), order: z.number().int().min(0).max(99).optional(),
    textControl: z.enum(["email", "text", "textarea"]).optional(),
    defaultValue: z.union([z.string().max(10000), z.number().finite(), z.boolean()]).optional(),
    queryParam: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/).optional(),
  }).strict()).max(100).optional(),
}).strict().superRefine((value, context) => {
  const ids = value.steps?.map(step => step.id) ?? [1];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Duplicate step ID" });
  if (value.fields?.some(field => field.step !== undefined && !ids.includes(field.step))) context.addIssue({ code: "custom", message: "Unknown field step" });
  const names = value.fields?.map(field => field.name) ?? [];
  if (new Set(names).size !== names.length) context.addIssue({ code: "custom", message: "Duplicate field presentation" });
});
export type PagePresentation = z.infer<typeof pagePresentationSchema>;

export type PageField = {
  page: number;
  valueType: "string" | "number" | "boolean" | "array";
  defaultValue?: string | number | boolean;
  queryParam?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  description?: string;
  helpText?: string;
  htmlControl: "checkbox" | "email" | "number" | "select" | "text" | "textarea";
  label: string;
  maxLength?: number;
  minLength?: number;
  name: string;
  options?: Array<{ label: string; value: string | number | boolean }>;
  placeholder?: string;
  required: boolean;
};

