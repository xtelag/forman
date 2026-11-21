import Ajv from "ajv";
import addFormats from "ajv-formats";

// Keep browser validation and intake coercion/format semantics identical.
export function createSourceSchemaValidator() {
  const ajv = new Ajv({ allErrors: false, coerceTypes: "array", strict: false });
  addFormats(ajv);
  return ajv;
}
