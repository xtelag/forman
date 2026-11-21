import { z } from "zod";
import type { PageField, PagePresentation } from "./contracts/page";
import { formLayout } from "./form-layout";
import { validPageValue } from "./page-form";
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/);
const fieldSchema = z.object({name,label:z.string().trim().min(1).max(200).optional(),helpText:z.string().trim().max(500).optional(),placeholder:z.string().trim().max(200).optional(),input:z.enum(["text","email","textarea"]).optional(),defaultValue:z.union([z.string().max(10000),z.number().finite(),z.boolean()]).optional(),queryParam:name.optional(),fallback:z.string().max(200).optional()}).strict();
const content = {title:z.string().trim().max(200).optional(),introduction:z.string().trim().max(1000).optional()};
const stepSchema = z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),title:z.string().trim().max(120).optional(),fields:z.array(fieldSchema).max(100)}).strict();
const sessionSchema = z.object({...content,steps:z.array(stepSchema).min(1).max(100)}).strict();
const oneShotSchema = z.object({...content,fields:z.array(fieldSchema).max(100)}).strict();
type Layout = Required<Pick<PagePresentation,"steps"|"fields"|"fallbacks">> & Pick<PagePresentation,"title"|"description">;
export function parseFormJson(text:string,source:PageField[],sessions:boolean):Layout {
  let raw:unknown;
  try {raw=JSON.parse(text);} catch(error) {throw new Error(`Invalid JSON: ${error instanceof Error?error.message:"Check the syntax."}`);}
  const parsed=(sessions?sessionSchema:oneShotSchema).safeParse(raw);
  if(!parsed.success) throw new Error(parsed.error.issues.map(issue=>`${issue.path.join(".")||"form"}: ${issue.message}`).join("; "));
  const data=parsed.data;
  const steps="steps" in data?data.steps:[{id:1,title:"",fields:data.fields}];
  const result:Layout={steps:[],fields:[],fallbacks:{},...(data.title?{title:data.title}:{}),...(data.introduction?{description:data.introduction}:{})};
  const names=new Set<string>(); const ids=new Set<number>();
  for(const [stepIndex,step] of steps.entries()) {
    if(ids.has(step.id)) throw new Error(`steps.${stepIndex}.id: Duplicate step ID.`);
    ids.add(step.id); result.steps.push({id:step.id,title:step.title??""});
    for(const [index,field] of step.fields.entries()) {
      const path=sessions?`steps.${stepIndex}.fields.${index}`:`fields.${index}`;
      const fail=(message:string):never=>{throw new Error(`${path}: ${message}`);};
      const {name,input,fallback,...settings}=field;
      const definition=source.find(item=>item.name===name);
      if(!definition) return fail(`Unknown field "${name}".`);
      if(names.has(name)) return fail(`Duplicate field "${name}".`);
      if(input && (definition.valueType!=="string" || definition.options)) return fail(`Input style is unavailable for "${name}".`);
      if(settings.defaultValue!==undefined && !validPageValue({...definition,...(input?{htmlControl:input}:{})},settings.defaultValue,false)) return fail(`Default value does not match "${name}" constraints.`);
      if(result.fields.length>=100) return fail("At most 100 fields are supported.");
      names.add(name);
      result.fields.push({name,step:step.id,order:result.fields.length,...settings,...(input?{textControl:input}:{})});
      if(fallback!==undefined) result.fallbacks[name]=fallback;
    }
  }
  const missing=source.filter(field=>!names.has(field.name)).map(field=>field.name);
  if(missing.length) throw new Error(`Missing fields: ${missing.join(", ")}.`);
  return result;
}
export function serializeFormJson(source:PageField[],presentation:PagePresentation|null,sessions:boolean):string {
  const layout=formLayout(source,presentation);
  const fieldObject=(field:typeof layout.fields[number])=>{
    const {name,step,order,textControl,...settings}=field; void step; void order;
    return {name,...settings,...(textControl?{input:textControl}:{}),...(presentation?.fallbacks?.[name]!==undefined?{fallback:presentation.fallbacks[name]}:{})};
  };
  return JSON.stringify({title:presentation?.title??"",introduction:presentation?.description??"",...(sessions?{steps:layout.steps.map(step=>({id:step.id,title:step.title,fields:layout.fields.filter(field=>field.step===step.id).map(fieldObject)}))}:{fields:layout.fields.map(fieldObject)})},null,2);
}
