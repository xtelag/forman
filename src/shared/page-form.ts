import type { ErrorObject } from "ajv";
import { createSourceSchemaValidator } from "./source-schema-validator";
import { parseJsonSchema } from "./source-fields-definition";
import type { SystemTextKey } from "./system-texts";
import type { PageField } from "@/shared/contracts/page";
import { submissionPayloadSchema, type SubmissionPayload } from "@/shared/contracts/submission";
import { pageMessages, resolveSystemTexts, formatSystemText, type SystemTextOverrides } from "@/shared/system-texts";
export { pageMessages };
export function pageText(text: string, answers: SubmissionPayload, fallbacks: Record<string, string> = {}) {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g, (_, key: string) => {
    const value = Object.hasOwn(answers, key) ? answers[key] : undefined;
    return value === undefined || value === "" ? (Object.hasOwn(fallbacks, key) ? fallbacks[key] : "") : Array.isArray(value) ? value.join(", ") : String(value);
  });
}
type PageValueIssue = "required" | "number" | "boolean" | "string" | "option" | "minimum" | "maximum" | "minLength" | "maxLength" | "email" | "pattern" | "invalidValue";
function pageValueIssue(field: PageField, value: unknown, requireValue: boolean): PageValueIssue | null {
  if (value === undefined || value === "") return requireValue && field.required ? "required" : null;
  if (field.valueType === "array" && (!Array.isArray(value) || !submissionPayloadSchema.safeParse({ value }).success)) return "invalidValue";
  if (field.valueType === "number" && (typeof value !== "number" || !Number.isFinite(value))) return "number";
  if (field.valueType === "boolean" && typeof value !== "boolean") return "boolean";
  if (field.valueType === "string" && typeof value !== "string") return "string";
  if (field.options && !field.options.some(option => option.value === value)) return "option";
  if (typeof value === "number") {
    if (field.minimum !== undefined && value < field.minimum) return "minimum";
    if (field.maximum !== undefined && value > field.maximum) return "maximum";
  }
  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) return "minLength";
    if (field.maxLength !== undefined && value.length > field.maxLength) return "maxLength";
    if (field.htmlControl === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
    if (field.pattern) { try { if (!new RegExp(field.pattern).test(value)) return "pattern"; } catch { return "pattern"; } }
  }
  return null;
}
export function validPageValue(field: PageField, value: unknown, requireValue = true): boolean {
  return pageValueIssue(field, value, requireValue) === null;
}
export function pageValueError(field: PageField, value: unknown, language: "en" | "cs", overrides?: SystemTextOverrides): string | null {
  const issue = pageValueIssue(field, value, true);
  if (!issue) return null;
  const messages = resolveSystemTexts(language, overrides);
  return formatSystemText(messages[issue], {minimum: field.minimum, maximum: field.maximum, minLength: field.minLength, maxLength: field.maxLength});
}
export function pageInputValue(field: PageField, value: string): SubmissionPayload[string] | undefined {
  if (field.valueType === "array") {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = submissionPayloadSchema.safeParse({ value: parsed });
      return Array.isArray(parsed) && result.success ? result.data.value : undefined;
    } catch { return undefined; }
  }
  if (field.valueType === "boolean") return value === "true" ? true : value === "false" ? false : undefined;
  if (field.valueType === "number") return value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
  return value;
}
export function pageInitialAnswers(fields: PageField[], query: URLSearchParams, source?: string): SubmissionPayload {
  const answers: SubmissionPayload = {};
  for (const field of fields) {
    if (field.valueType === "boolean") answers[field.name] = false;
    if (field.defaultValue !== undefined && (source ? !validatePageAnswers([field], { [field.name]: field.defaultValue }, source, false).length : validPageValue(field, field.defaultValue, false))) answers[field.name] = field.defaultValue;
    const parameter = field.queryParam ? query.get(field.queryParam) : null;
    if (parameter !== null) { const value = pageInputValue(field, parameter); if (value !== undefined && (source ? !validatePageAnswers([field], { [field.name]: value }, source, false).length : validPageValue(field, value, false))) answers[field.name] = value; }
  }
  return answers;
}

export type PageValidationIssue = { name: string; key: SystemTextKey; values?: Record<string, string | number> };
const schemaCache = new Map<string, ReturnType<typeof compilePageSchema>>();
function compilePageSchema(source: string) {
  const schema = parseJsonSchema(source);
  const ajv = createSourceSchemaValidator();
  const schemaId = (schema as Record<string, unknown>).$id;
  const id = typeof schemaId === "string" ? schemaId : "urn:forman:source";
  ajv.addSchema(schema, id);
  const validate = ajv.getSchema(id)!;
  const fields = new Map<string, ReturnType<typeof ajv.compile>>();
  return { schema, validate, field(name: string) {
    if (!fields.has(name)) fields.set(name, ajv.compile({ type: "object", properties: { [name]: { $ref: `${id}#/properties/${name}` } }, required: schema.required?.includes(name) ? [name] : [] }));
    return fields.get(name)!;
  } };
}
function pageSchema(source: string) {
  let compiled = schemaCache.get(source);
  if (!compiled) {
    compiled = compilePageSchema(source);
    if (schemaCache.size >= 20) schemaCache.delete(schemaCache.keys().next().value!);
    schemaCache.set(source, compiled);
  }
  return compiled;
}
function schemaIssue(error: ErrorObject, name: string): PageValidationIssue {
  const keyword = error.keyword;
  const key: SystemTextKey = keyword === "type" ? (error.params.type === "integer" ? "integer" : ["number", "boolean", "string"].includes(error.params.type) ? error.params.type : "invalidValue")
    : keyword === "enum" ? "option" : keyword === "format" ? (error.params.format === "email" ? "email" : "pattern")
    : ["required", "minimum", "maximum", "minLength", "maxLength", "pattern"].includes(keyword) ? keyword as SystemTextKey : "invalidValue";
  return { name, key, values: { [keyword]: error.params.limit } };
}
export function validatePageAnswers(fields: PageField[], answers: SubmissionPayload, source?: string, final = true): PageValidationIssue[] {
  if (!source) return fields.flatMap(field => { const key = pageValueIssue(field, answers[field.name], true); return key ? [{ name: field.name, key, values: { minimum: field.minimum!, maximum: field.maximum!, minLength: field.minLength!, maxLength: field.maxLength! } }] : []; });
  const compiled = pageSchema(source);
  const value = structuredClone(answers);
  if (!final) return fields.flatMap(field => {
    const validate = compiled.field(field.name);
    const input = Object.hasOwn(value, field.name) ? { [field.name]: value[field.name] } : {};
    return validate(input) ? [] : (validate.errors ?? []).map(error => schemaIssue(error, field.name));
  });
  if (compiled.validate(value)) return submissionPayloadSchema.safeParse(value).success ? [] : fields.map(field => ({ name: field.name, key: "invalidValue" }));
  return (compiled.validate.errors ?? []).flatMap(error => {
    const name = error.keyword === "required" ? error.params.missingProperty : error.instancePath.split("/")[1];
    const targets = fields.some(field => field.name === name) ? [name] : fields.map(field => field.name);
    return targets.map(target => schemaIssue(error, target));
  });
}
export function pageValidationMessage(issue: PageValidationIssue, language: "en" | "cs", overrides?: SystemTextOverrides) {
  return formatSystemText(resolveSystemTexts(language, overrides)[issue.key], issue.values ?? {});
}
