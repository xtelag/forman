const email = { type: "string", format: "email", maxLength: 254 } as const;
const name = { type: "string", minLength: 1, maxLength: 80 } as const;
const organization = { type: "string", maxLength: 120 } as const;

export const sourceFieldTemplates = {
  "email-only": {
    type: "object", properties: { email }, required: ["email"], additionalProperties: false,
  },
  "name-email": {
    type: "object", properties: { name, email }, required: ["name", "email"], additionalProperties: false,
  },
  "name-email-organization": {
    type: "object", properties: { name, email, organization }, required: ["name", "email"], additionalProperties: false,
  },
  "name-email-organization-note": {
    type: "object", properties: { name, email, organization, note: { type: "string", maxLength: 1000 } }, required: ["name", "email"], additionalProperties: false,
  },
  registration: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      email: { type: "string", format: "email", maxLength: 254 },
      organization: { type: "string", maxLength: 120 },
    },
    required: ["name", "email"],
    additionalProperties: false,
  },
  survey: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      rating: { type: "integer", minimum: 1, maximum: 5 },
      comment: { type: "string", maxLength: 1000 },
    },
    required: ["name", "rating"],
    additionalProperties: false,
  },
} as const;
export type SourceFieldTemplate = keyof typeof sourceFieldTemplates;
