import { z } from "zod";

import type { SubmissionPayload } from "./submission";

const actionConditionOperatorSchema = z.enum([
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "exists",
  "isEmpty",
]);

const actionConditionRuleSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    operator: actionConditionOperatorSchema,
    value: z.string().max(4_096).optional(),
  })
  .superRefine((rule, context) => {
    if (["exists", "isEmpty"].includes(rule.operator)) return;
    if (rule.value?.trim()) return;
    context.addIssue({
      code: "custom",
      message: "A comparison value is required",
      path: ["value"],
    });
  });

export const actionConditionSchema = z.object({
  conditions: z.array(actionConditionRuleSchema).min(1).max(20),
  mode: z.enum(["all", "any"]),
});

export type ActionCondition = z.infer<typeof actionConditionSchema>;
export type ActionConditionOperator = z.infer<typeof actionConditionOperatorSchema>;

function valuesFor(payload: SubmissionPayload, field: string) {
  const value = payload[field];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function matchesRule(
  payload: SubmissionPayload,
  rule: ActionCondition["conditions"][number],
) {
  const values = valuesFor(payload, rule.field);
  if (rule.operator === "exists") return values.length > 0;
  if (rule.operator === "isEmpty") {
    return values.length === 0 || values.every((value) => value.length === 0);
  }
  if (values.length === 0) return false;
  const expected = rule.value ?? "";
  const contains = (value: string) => value.includes(expected);
  const equals = (value: string) => value === expected;
  if (rule.operator === "equals") return values.some(equals);
  if (rule.operator === "notEquals") return !values.some(equals);
  if (rule.operator === "contains") return values.some(contains);
  return !values.some(contains);
}

export function matchesActionCondition(
  payload: SubmissionPayload,
  condition: ActionCondition | null | undefined,
) {
  if (!condition) return true;
  const matched = condition.conditions.map((rule) => matchesRule(payload, rule));
  return condition.mode === "all" ? matched.every(Boolean) : matched.some(Boolean);
}

export function parseActionCondition(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = actionConditionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function matchesStoredActionCondition(
  payload: SubmissionPayload,
  value: string | null | undefined,
) {
  if (!value) return true;
  const condition = parseActionCondition(value);
  return condition ? matchesActionCondition(payload, condition) : false;
}
