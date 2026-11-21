import { z } from "zod";
export const sourceTypeSchema = z.enum(["one-shot", "session", "m2m"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;
export const sourceTypeLabels: Record<SourceType, string> = { "one-shot": "One-shot", session: "Session", m2m: "M2M" };
