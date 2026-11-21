import {expect,test} from "vitest";
import {parseFormJson,serializeFormJson} from "@/shared/form-json";
const fields=[{name:"name",label:"Name",page:1,valueType:"string" as const,htmlControl:"text" as const,required:true,minLength:2}];
test("round trips content, stable steps, presentation and personalization",()=>{
 const presentation={title:"Survey",description:"Hello {{name}}",steps:[{id:3,title:"About"}],fields:[{name:"name",step:3,order:0,label:"Name",textControl:"textarea" as const,defaultValue:"Ada",queryParam:"who",helpText:"Help",placeholder:"Ada"}],fallbacks:{name:"Guest"}};
 expect(parseFormJson(serializeFormJson(fields,presentation,true),fields,true)).toEqual(presentation);
});
test("one-shot uses root fields and normalizes empty content",()=>{
 const text=serializeFormJson(fields,null,false);
 expect(JSON.parse(text)).toEqual({title:"",introduction:"",fields:[{name:"name"}]});
 expect(parseFormJson(text,fields,false)).not.toHaveProperty("title");
});
test("rejects syntax, wrong mode, duplicate IDs/fields, unknown fields and invalid controls",()=>{
 expect(()=>parseFormJson('{bad}',[],false)).toThrow(/Invalid JSON/);
 expect(()=>parseFormJson('{"steps":[]}',[],false)).toThrow();
 expect(()=>parseFormJson('{"fields":[]}',[],true)).toThrow();
 expect(()=>parseFormJson('{"steps":[{"id":1,"fields":[]},{"id":1,"fields":[]}]}',[],true)).toThrow(/Duplicate step/);
 expect(()=>parseFormJson('{"fields":[{"name":"name"},{"name":"name"}]}',fields,false)).toThrow(/Duplicate field/);
 expect(()=>parseFormJson('{"fields":[{"name":"unknown"}]}',fields,false)).toThrow(/Unknown field/);
 expect(()=>parseFormJson('{"fields":[]}',fields,false)).toThrow(/Missing fields/);
 expect(()=>parseFormJson('{"fields":[{"name":"name","defaultValue":false}]}',fields,false)).toThrow(/Default value/);
 expect(()=>parseFormJson('{"fields":[],"unknown":1}',[],false)).toThrow();
});
