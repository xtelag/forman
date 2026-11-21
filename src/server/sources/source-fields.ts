import type Ajv from "ajv";
import { createSourceSchemaValidator } from "@/shared/source-schema-validator";

import {
  submissionPayloadSchema,
  type SubmissionPayload,
} from "@/shared/contracts/submission";

export type SourceFieldsMode = "json-schema";

type CompiledSourceFields = {
  columns: string[];
  parse: (payload: SubmissionPayload) => SubmissionPayload | null;
};

import { parseJsonSchema } from "@/shared/source-fields-definition";
function invalidDefinition(): never { throw new Error("Source fields definition is invalid."); }

function jsonSchemaValidator(source: string): CompiledSourceFields {
  const schema = parseJsonSchema(source);
  const columns = Object.keys(schema.properties);
  let validate: ReturnType<Ajv["compile"]>;
  try {
    const ajv = createSourceSchemaValidator();
    validate = ajv.compile(schema as object);
  } catch {
    return invalidDefinition();
  }
  return {
    columns,
    parse(payload) {
      const value = structuredClone(payload);
      if (!validate(value)) return null;
      const parsed = submissionPayloadSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
  };
}

export function compileSourceFields(mode: SourceFieldsMode, source: string): CompiledSourceFields {
  if (mode !== "json-schema") return invalidDefinition();
  return jsonSchemaValidator(source);
}

export function sourceFieldsColumns(mode: SourceFieldsMode | null, source: string | null) {
  if (!mode || !source) return [];
  return compileSourceFields(mode, source).columns;
}
