import { formLayout } from "@/shared/form-layout";
import type { PagePresentation } from "@/shared/contracts/page";
import { parseJsonSchema } from "@/shared/source-fields-definition";

import type { PageField } from "@/shared/contracts/page";
export type { PageField } from "@/shared/contracts/page";

export type PageViewModel = { fields: PageField[] };

function humanize(name: string) {
  return name.replace(/[_-]+/g, " ").replace(/^./, character => character.toUpperCase());
}

type JsonSchemaProperty = {
  minimum?: number;
  maximum?: number;
  pattern?: string;
  description?: unknown;
  enum?: unknown;
  format?: unknown;
  maxLength?: unknown;
  minLength?: unknown;
  title?: unknown;
  type?: unknown;
};

function createJsonSchemaFields(source: string): PageField[] {
  const schema = parseJsonSchema(source) as { properties?: Record<string, JsonSchemaProperty>; required?: unknown; type?: unknown };
  if (!schema || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object") throw new Error("Invalid Source fields definition");
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []);
  return Object.entries(schema.properties).map(([name, property]) => {
    const values = Array.isArray(property.enum) && property.enum.every((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      ? property.enum as Array<string | number | boolean>
      : null;
    const type = property.type;
    return {
      page: 1,
      valueType: type === "array" ? "array" : type === "boolean" ? "boolean" : type === "number" || type === "integer" ? "number" : "string",
      minimum: property.minimum, maximum: property.maximum, pattern: property.pattern,
      ...(typeof property.description === "string" ? { description: property.description } : {}),
      htmlControl: type === "array" ? "textarea" : values ? "select" : type === "boolean" ? "checkbox" : type === "number" || type === "integer" ? "number" : property.format === "email" ? "email" : name === "message" || name === "note" ? "textarea" : "text",
      ...(type === "array" ? { placeholder: '["first", "second"]' } : {}),
      label: typeof property.title === "string" ? property.title : humanize(name),
      ...(typeof property.maxLength === "number" ? { maxLength: property.maxLength } : {}),
      ...(typeof property.minLength === "number" ? { minLength: property.minLength } : {}),
      name,
      ...(values ? { options: values.map((value) => ({ label: String(value), value })) } : {}),
      required: required.has(name),
    } satisfies PageField;
  });
}

function applyPresentation(fields: PageField[], presentation: PagePresentation | null) {
  const layout = formLayout(fields, presentation);
  const sourceFields = new Map(fields.map(field => [field.name, field]));
  return layout.fields.map(override => {
    const field = sourceFields.get(override.name)!;
    const supportsTextControl = field.valueType !== "array" && ["text", "email", "textarea"].includes(field.htmlControl);
    return {
      ...field, page: override.step,
      defaultValue: override.defaultValue, queryParam: override.queryParam,
      ...(override.label ? { label: override.label } : {}),
      ...(override.helpText ? { helpText: override.helpText } : {}),
      ...(override.placeholder ? { placeholder: override.placeholder } : {}),
      ...(supportsTextControl && override.textControl ? { htmlControl: override.textControl } : {}),
    };
  });
}

export function createPageViewModel({ mode, presentation, source }: {
  mode: "json-schema";
  presentation: PagePresentation | null;
  source: string;
}): PageViewModel {
  if (mode !== "json-schema") throw new Error("Invalid Source fields format");
  const fields = createJsonSchemaFields(source);
  return { fields: applyPresentation(fields, presentation) };
}

