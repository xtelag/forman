import { DuplicateJsonKeyError, parseUniqueJson } from "@/server/http/unique-json";
import { parseJsonSchema } from "@/shared/source-fields-definition";
import {
  submissionPayloadSchema,
  type SubmissionPayload,
} from "@/shared/contracts/submission";

export const LEGACY_HONEYPOT_FIELD = "forman_company_website";
export const HONEYPOT_FIELD = LEGACY_HONEYPOT_FIELD;

export class UnsupportedBrowserSubmissionContentTypeError extends Error {}
export class InvalidBrowserSubmissionError extends Error {}
export class VerificationFailedError extends Error { constructor() { super("Verification failed"); } }

type ParsedBrowserSubmission = {
  altchaPayload: string | null;
  limitPayload: SubmissionPayload;
  payload: SubmissionPayload;
};

type BrowserProtections = {
  fieldDefinitionMode?: string | null;
  fieldDefinitionSource?: string | null;
  altchaEnabled: boolean;
  honeypotEnabled: boolean;
  honeypotFieldNames?: string[];
};

type SubmissionLimits = {
  maxEntries: number;
  maxKeyLength: number;
  maxUniqueKeys: number;
  maxValueLength: number;
  maxValuesPerKey: number;
};

export function parseBrowserSubmission(
  contentType: string | null,
  body: string,
  protections: BrowserProtections,
) {
  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (normalizedContentType.startsWith("application/x-www-form-urlencoded"))
    return parseUrlEncodedBrowserSubmission(new URLSearchParams(body), protections);
  if (normalizedContentType.startsWith("application/json"))
    return parseJsonBrowserSubmission(body, protections);
  throw new UnsupportedBrowserSubmissionContentTypeError("Unsupported content type");
}

function parseUrlEncodedBrowserSubmission(
  body: URLSearchParams,
  protections: BrowserProtections,
) {
  const honeypotFieldNames = protections.honeypotFieldNames ?? [LEGACY_HONEYPOT_FIELD];
  if (protections.honeypotEnabled) for (const name of honeypotFieldNames) {
    const honeypotValues = body.getAll(name);
    if (honeypotValues.length !== 1 || honeypotValues[0] !== "") {
      throw new VerificationFailedError();
    }
  }

  let altchaPayload: string | null = null;
  if (protections.altchaEnabled) {
    const altchaValues = body.getAll("altcha");
    if (altchaValues.length !== 1 || altchaValues[0] === "") {
      throw new VerificationFailedError();
    }
    altchaPayload = altchaValues[0];
  }

  const limitPayload: Record<string, string[]> = Object.create(null);
  const payload: SubmissionPayload = Object.create(null);
  for (const [key, value] of body) {
    if (honeypotFieldNames.includes(key) || key === "altcha") continue;
    (limitPayload[key] ??= []).push(value);
    payload[key] = value;
  }

  // Decode only fields declared by the saved Source schema. JSON requests already
  // carry typed values; schemaless HTML retains its existing last-value semantics.
  if (protections.fieldDefinitionMode === "json-schema" && protections.fieldDefinitionSource) {
    const schema = parseJsonSchema(protections.fieldDefinitionSource);
    for (const [name, property] of Object.entries(schema.properties)) {
      const values = limitPayload[name];
      if (!values) continue;
      if (values.every(value => value === "")) { delete payload[name]; continue; }
      if (property.type !== "array") continue;
      let value: unknown = values;
      if (values.length === 1 && values[0].trimStart().startsWith("[")) {
        try { value = JSON.parse(values[0]); }
        catch { throw new InvalidBrowserSubmissionError("Invalid array input"); }
      }
      const parsed = submissionPayloadSchema.safeParse({ [name]: value });
      if (!parsed.success) throw new InvalidBrowserSubmissionError("Invalid array input");
      payload[name] = parsed.data[name];
    }
  }

  return { altchaPayload, limitPayload, payload } satisfies ParsedBrowserSubmission;
}

function parseJsonBrowserSubmission(body: string, protections: BrowserProtections) {
  let parsed: unknown;
  try {
    parsed = parseUniqueJson(body);
  } catch (error) {
    if (error instanceof DuplicateJsonKeyError && (error.key === "altcha" || (protections.honeypotFieldNames ?? [LEGACY_HONEYPOT_FIELD]).includes(error.key))) throw new VerificationFailedError();
    throw new InvalidBrowserSubmissionError("Invalid JSON payload");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
    throw new InvalidBrowserSubmissionError("JSON payload must be an object");

  const values = { ...parsed } as Record<string, unknown>;
  const honeypotFieldNames = protections.honeypotFieldNames ?? [LEGACY_HONEYPOT_FIELD];
  const altcha = values.altcha;
  if (protections.honeypotEnabled && honeypotFieldNames.some(name => !Object.hasOwn(values, name) || values[name] !== "")) throw new VerificationFailedError();
  for (const name of honeypotFieldNames) delete values[name];
  delete values.altcha;

  if (protections.altchaEnabled && (typeof altcha !== "string" || altcha === ""))
    throw new VerificationFailedError();

  const payload = submissionPayloadSchema.safeParse(values);
  if (!payload.success)
    throw new InvalidBrowserSubmissionError("Invalid JSON payload");

  return {
    altchaPayload: protections.altchaEnabled && typeof altcha === "string" ? altcha : null,
    limitPayload: payload.data,
    payload: payload.data,
  } satisfies ParsedBrowserSubmission;
}

export function validateSubmissionLimits(payload: SubmissionPayload, limits: SubmissionLimits) {
  const entries = Object.entries(payload);
  if (entries.length > limits.maxUniqueKeys) return false;

  let entryCount = 0;
  for (const [key, value] of entries) {
    const values = Array.isArray(value) ? value : [value];
    if (key.length > limits.maxKeyLength || values.length > limits.maxValuesPerKey) return false;
    entryCount += values.length;
    if (entryCount > limits.maxEntries || values.some((item) => typeof item === "string" && item.length > limits.maxValueLength)) {
      return false;
    }
  }

  return true;
}
