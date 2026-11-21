import { parseJsonSchema } from "@/shared/source-fields-definition";
import { compileSourceFields } from "./source-fields";

export type IntegrationField = {
  name: string; label: string; type: string; required: boolean; format?: string;
  minLength?: number; maxLength?: number; minimum?: number; maximum?: number;
  pattern?: string; options?: unknown[]; sample: unknown;
};
export const scriptJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
export const html = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function integrationFields(definition?: string | null) {
  const schema = definition ? parseJsonSchema(definition) : {properties:{name:{type:"string"},email:{type:"string",format:"email"}},required:[] as string[]};
  const fields: IntegrationField[] = Object.entries(schema.properties).map(([name, p]) => {
    const type = typeof p.type === "string" ? p.type : "string";
    let sample: unknown = p.const ?? (Array.isArray(p.enum) ? p.enum[0] : p.default);
    if (sample === undefined) {
      if (type === "boolean") sample = false;
      else if (type === "number" || type === "integer") sample = typeof p.minimum === "number" ? p.minimum : typeof p.maximum === "number" ? Math.min(0,p.maximum) : 1;
      else if (type === "array") sample = [];
      else {
        let value = p.format === "email" ? "person@example.com" : p.format === "uri" || p.format === "url" ? "https://example.com" : "Example";
        if (typeof p.minLength === "number") value = value.padEnd(Math.min(p.minLength,1000),"x");
        if (typeof p.maxLength === "number") value = value.slice(0,Math.max(0,p.maxLength));
        sample = value;
      }
    }
    return {name,label:typeof p.title === "string" ? p.title : name,type,required:schema.required?.includes(name)??false,sample,
      ...(typeof p.format === "string" ? {format:p.format}:{}),
      ...Object.fromEntries(["minLength","maxLength","minimum","maximum","pattern"].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),
      ...(Array.isArray(p.enum)?{options:p.enum}:{})};
  });
  const payload = Object.fromEntries(fields.map(f=>[f.name,f.sample]));
  const warnings: Array<{variant:"info"|"warning";title:string;message:string}> = [];
  if (!definition) warnings.push({variant:"info",title:"Sample fields",message:"No field definition configured. Examples use sample fields. Replace the sample fields or configure Source Fields."});
  if (definition && !compileSourceFields("json-schema",definition).parse(payload as never)) warnings.push({variant:"warning",title:"Review sample values",message:"The sample payload needs adjustment to satisfy this schema. Review formats, patterns and complex constraints before submitting."});
  if (fields.some(f=>!["string","number","integer","boolean"].includes(f.type))) warnings.push({variant:"warning",title:"Review field controls",message:"Array fields use JSON input in HTML, JavaScript, React and Popup. All intake types, including M2M, accept scalars or non-empty arrays of scalars; nested payloads are not supported."});
  return {fields,payload,warnings};
}

export function fieldMarkup(fields: IntegrationField[], jsx = false) {
  return fields.map(f=>{
    const label = jsx ? `{${scriptJson(f.label)}}` : html(f.label);
    const attr = (key:string,value:unknown) => jsx ? ` ${key}={${scriptJson(value)}}` : ` ${key}="${html(value)}"`;
    const name = attr("name",f.name);
    const required = f.required ? " required" : "";
    let control: string;
    if (f.options || f.type === "boolean") {
      const values = f.options ?? [true,false];
      control = `<select${name}${required}>\n<option value="">Choose…</option>\n${values.map(v=>`<option${attr("value",String(v))}>${jsx?`{${scriptJson(String(v))}}`:html(v)}</option>`).join("\n")}\n</select>`;
    } else {
      const type = f.type === "number" || f.type === "integer" ? "number" : f.format === "email" ? "email" : f.format === "uri" || f.format === "url" ? "url" : "text";
      const constraints = [[jsx?"minLength":"minlength",f.minLength],[jsx?"maxLength":"maxlength",f.maxLength],["min",f.minimum],["max",f.maximum]].filter(([,v])=>v!==undefined).map(([k,v])=>attr(String(k),v)).join("");
      // JSON Schema and HTML patterns have different semantics; the server remains authoritative.
      control = f.type === "array" || f.type === "object" ? `<textarea${name}${required} placeholder='JSON value'></textarea>` : `<input${name} type="${type}"${required}${constraints}${type==="number"?` step="${f.type==="integer"?"1":"any"}"`:""}${jsx?" /":""}>`;
    }
    return `<label>${label}\n${control}\n</label>`;
  }).join("\n");
}
