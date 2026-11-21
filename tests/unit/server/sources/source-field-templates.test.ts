import {expect,test} from "vitest";
import {sourceFieldTemplates} from "@/shared/source-field-templates";
import {compileSourceFields} from "@/server/sources/source-fields";
test("templates validate required values, formats, range and unknown fields",()=>{
 const registration=compileSourceFields("json-schema",JSON.stringify(sourceFieldTemplates.registration));
 const survey=compileSourceFields("json-schema",JSON.stringify(sourceFieldTemplates.survey));
 expect(registration.parse({name:"Alice",email:"alice@example.com"})).toBeTruthy();
 expect(registration.parse({name:"Alice",email:"invalid"})).toBeFalsy();
 expect(registration.parse({name:"Alice"})).toBeFalsy();
 expect(survey.parse({name:"Alice",rating:5})).toBeTruthy();
 expect(survey.parse({name:"Alice",rating:6})).toBeFalsy();
 expect(survey.parse({name:"Alice",rating:2.5})).toBeFalsy();
 expect(survey.parse({name:"Alice",rating:2,extra:"x"})).toBeFalsy();
});

test.each(["email-only", "name-email", "name-email-organization"] as const)("One-shot template %s validates its exact fields", key => {
 const schema=sourceFieldTemplates[key];
 const validator=compileSourceFields("json-schema",JSON.stringify(schema));
 const payload: Record<string,string>=key==="email-only"?{email:"alice@example.com"}:{name:"Alice",email:"alice@example.com"};
 expect(validator.parse(payload)).toBeTruthy();
 expect(validator.parse({...payload,email:"invalid"})).toBeFalsy();
 const missingEmail={...payload};delete missingEmail.email;
 expect(validator.parse(missingEmail)).toBeFalsy();
 expect(validator.parse({...payload,extra:"x"})).toBeFalsy();
 if(key!=="email-only") {
   expect(validator.parse({...payload,name:""})).toBeFalsy();
   expect(validator.parse({...payload,name:"x".repeat(81)})).toBeFalsy();
 }
 if(key==="name-email-organization") {
   expect(Object.keys(schema.properties)).toEqual(["name","email","organization"]);
   expect(validator.parse({...payload,organization:"Company"})).toBeTruthy();
   expect(validator.parse({...payload,organization:"x".repeat(121)})).toBeFalsy();
 } else expect(validator.parse({...payload,organization:"Company"})).toBeFalsy();
});


test("note template preserves field order and accepts an optional bounded multiline note", () => {
 const schema = sourceFieldTemplates["name-email-organization-note"];
 const validator = compileSourceFields("json-schema", JSON.stringify(schema));
 expect(Object.keys(schema.properties)).toEqual(["name", "email", "organization", "note"]);
 const payload = {name: "Alice", email: "alice@example.com"};
 expect(validator.parse(payload)).toBeTruthy();
 expect(validator.parse({...payload, organization: "Company", note: "First line\nSecond line"})).toBeTruthy();
 expect(validator.parse({...payload, note: "x".repeat(1001)})).toBeFalsy();
 expect(validator.parse({...payload, note: ["first", "second"]})).toBeFalsy();
});
