import {expect,test} from "vitest";
import ts from "typescript";
import {integrationFields} from "@/server/sources/integration-fields";
import {createBrowserHtmlSnippet,createBrowserJavaScriptSnippet,createReactJsxSnippet,createMachineToMachineSnippet,createPopupSourceSnippet} from "@/server/sources/integration-snippets";
const base={submissionUrl:"https://forman.test/api/submit/source",challengeUrl:"https://forman.test/api/challenge/source",protections:{altchaEnabled:true,honeypotEnabled:true,honeypotFieldNames:["company_website"]}};
test("derives names, constraints and typed examples from the actual schema",()=>{
 const model=integrationFields(JSON.stringify({type:"object",properties:{rating:{type:"integer",minimum:1,maximum:5},accepted:{type:"boolean"},contact:{type:"string",format:"email"}},required:["rating"],additionalProperties:false}));
 expect(model.payload).toEqual({rating:1,accepted:false,contact:"person@example.com"});
 expect(model.warnings).toEqual([]);
 const html=createBrowserHtmlSnippet({...base,fields:model.fields});
 expect(html).toContain('name="rating" type="number" required min="1" max="5"');
 expect(html).toContain('name="contact" type="email"');
 expect(html).not.toContain('name="note"');
 expect(createPopupSourceSnippet({sourceName:"Contact survey",sourceId:"source",popupScriptUrl:"https://forman.test/popup.js",fields:model.fields})).toContain('"name":"rating"');
});
test("flags fallback and unsynthesizable values and escapes administrator text",()=>{
 expect(integrationFields().warnings[0].message).toMatch(/No field definition/);
 const model=integrationFields(JSON.stringify({type:"object",properties:{name:{type:"string",title:'</script><script>alert(1)</script>',pattern:'^Z{10}$'}},additionalProperties:false}));
 expect(model.warnings[0].message).toMatch(/needs adjustment/);
 const js=createBrowserJavaScriptSnippet({...base,fields:model.fields},true);
 expect(js).not.toContain('<script>alert(1)');
});
test("React example is valid JSX and uses the same session controller",()=>{
 const code=createReactJsxSnippet(base,true);
 const output=ts.transpileModule(code,{fileName:"example.jsx",reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,allowJs:true,target:ts.ScriptTarget.ES2022}});
 expect(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)).toEqual([]);
 expect(code).toContain("return mountIntegration(formRef.current, config)");
 expect(code).toContain("crypto.randomUUID()");
 expect(code).toContain("protection: proof");
 expect(createBrowserJavaScriptSnippet(base)).not.toContain("operationId");
});
test("curl retains a token placeholder and shell-quotes payloads",()=>{
 const code=createMachineToMachineSnippet("https://forman.test/api/submit/source",true,{name:"O'Reilly"});
 expect(code).toContain("$FORMAN_SERVER_TOKEN");
 expect(code).toContain("O'\\''Reilly");
 expect(code).not.toContain("--insecure");
});

test("JS and React expose the endpoint before the controller in both modes",()=>{
 for(const session of [false,true]) {
  const options=base;
  for(const generate of [createBrowserJavaScriptSnippet,createReactJsxSnippet]) {
   const code=generate(options,session);
   expect(code).toContain(`const ENDPOINT = "${options.submissionUrl}";`);
   expect(code).toContain("endpoint: ENDPOINT");
   expect(code.indexOf("const ENDPOINT")).toBeLessThan(code.indexOf("function mountIntegration"));
   expect(code.split(options.submissionUrl)).toHaveLength(2);
  }
 }
});

test("browser examples separate session access keys from M2M credentials",()=>{
 for(const generate of [createBrowserJavaScriptSnippet,createReactJsxSnippet]) {
  const session=generate(base,true), oneShot=generate(base,false);
  expect(session).toContain("JSON.stringify({...body, sessionId})");
  expect(session).not.toContain("Authorization");
  expect(session).toContain("secret identifier");
  expect(session).not.toContain("config.session");
  expect(session).not.toContain("FORMAN_SERVER_TOKEN");
  expect(oneShot).not.toContain("Authorization");
  expect(oneShot).not.toContain("sessionId");
 }
});

 test("array guidance matches supported controls and flat M2M payloads",()=>{
  const model=integrationFields(JSON.stringify({type:"object",properties:{topics:{type:"array",items:{type:"string"}}},additionalProperties:false}));
  const warnings=model.warnings.map(w=>w.message).join(" ");
  expect(warnings).not.toContain("M2M accepts scalars only");
  expect(warnings).not.toContain("Popup may need custom controls");
  expect(warnings).toContain("non-empty arrays");
 });

test("all browser formats render every configured honeypot",()=>{
 const options={...base,protections:{...base.protections,honeypotFieldNames:["company","website"]}};
 for(const generate of [createBrowserHtmlSnippet,createBrowserJavaScriptSnippet,createReactJsxSnippet]) {
  const snippet=generate(options);expect(snippet).toContain('name="company"');expect(snippet).toContain('name="website"');
 }
});

test("popup title uses the Source name with safe inline-script encoding",()=>{
 const snippet=createPopupSourceSnippet({sourceId:"test",sourceName:'Survey </script> "A"',popupScriptUrl:"https://forman.test/popup.js"});
 expect(snippet).toContain('title: "Survey ');
 expect(snippet).not.toContain('Survey </script>');
 expect(snippet).not.toContain('title: "Contact us"');
});
test("Session examples place each field on a separate editable step",()=>{
 const fields=integrationFields(JSON.stringify({type:"object",properties:{name:{type:"string"},email:{type:"string"}},additionalProperties:false})).fields;
 for(const example of [createBrowserJavaScriptSnippet({...base,fields},true),createReactJsxSnippet({...base,fields},true)]) {
  expect(example).toContain('data-step="1"');expect(example).toContain('data-step="2"');
  expect(example).toContain('data-next=""');expect(example).toContain('data-back=""');
 }
 expect(createBrowserJavaScriptSnippet({...base,fields})).not.toContain('data-step="');
});
