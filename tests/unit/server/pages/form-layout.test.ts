import { expect, test } from "vitest";
import { createPageViewModel } from "@/server/pages/page-view-model";
import { compileSourceFields } from "@/server/sources/source-fields";
const source = '{"type":"object","properties":{"name":{"type":"string","minLength":2,"maxLength":80},"rating":{"type":"number"},"new":{"type":"string"}},"required":["name","rating"],"additionalProperties":false}';
test("Source validates data independently of form steps", () => {
  expect(compileSourceFields("json-schema", source).parse({name:"Ada",rating:5})).toEqual({name:"Ada",rating:5});
  expect(() => compileSourceFields("json-schema", JSON.stringify({type:"object",additionalProperties:false,properties:{name:{type:"string","x-page":1}}}))).toThrow();
});
test("each form owns order and stable step IDs; new fields append, removed fields disappear", () => {
  const model = createPageViewModel({mode:"json-schema",source,presentation:{steps:[{id:3,title:"Experience"},{id:1,title:"About you"}],fields:[{name:"name",step:1,order:0},{name:"rating",step:3,order:1},{name:"removed",step:3,order:2}]}});
  expect(model.fields.map(f=>[f.name,f.page])).toEqual([["rating",3],["name",1],["new",1]]);
  expect(createPageViewModel({mode:"json-schema",source,presentation:null}).fields.map(f=>f.page)).toEqual([1,1,1]);
});
