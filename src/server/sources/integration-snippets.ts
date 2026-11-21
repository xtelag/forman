import { altchaScriptUrl } from "@/shared/altcha-script";
import { fieldMarkup, html, integrationFields, scriptJson, type IntegrationField } from "./integration-fields";
import { integrationController, oneShotController } from "./integration-controller";
type BrowserProtections = { altchaEnabled:boolean; honeypotEnabled:boolean; honeypotFieldNames:string[] };
export type BrowserSnippetOptions = {challengeUrl:string;protections:BrowserProtections;submissionUrl:string;fields?:IntegrationField[]};
const fieldsFor = (options: {fields?:IntegrationField[]}) => options.fields ?? integrationFields().fields;
function proofMarkup(options:BrowserSnippetOptions,jsx=false) {
  const {protections}=options;
  const honeypot=protections.honeypotEnabled?protections.honeypotFieldNames.map(name => `<input aria-hidden="true" ${jsx?'autoComplete':'autocomplete'}="off" hidden name="${html(name)}" ${jsx?'tabIndex':'tabindex'}="-1" type="text"${jsx?' /':''}>`).join('\n'):'';
  const altcha=protections.altchaEnabled?`<altcha-widget challengeurl="${html(options.challengeUrl)}" name="altcha"></altcha-widget>`:'';
  return `<div data-protection="">${honeypot}\n${altcha}</div>`;
}
export function createBrowserHtmlSnippet(options:BrowserSnippetOptions) {
  return `${options.protections.altchaEnabled?`<script type="module" src="${html(altchaScriptUrl(options.challengeUrl))}"></script>\n`:''}<form action="${html(options.submissionUrl)}" method="post">\n${fieldMarkup(fieldsFor(options))}\n${proofMarkup(options)}\n<button type="submit">Submit</button>\n</form>`;
}
function configFor(options:BrowserSnippetOptions) {
  return {fields:fieldsFor(options).map(({name,type})=>({name,type})),honeypotFieldNames:options.protections.honeypotEnabled?options.protections.honeypotFieldNames:[],altcha:options.protections.altchaEnabled};
}
function configurationSnippet(options:BrowserSnippetOptions) {
  return `const ENDPOINT = ${scriptJson(options.submissionUrl)};
const config = { endpoint: ENDPOINT, ...${scriptJson(configFor(options))} };`;
}
function sessionFieldMarkup(options:BrowserSnippetOptions, jsx=false) {
  // Move fields between these sections to group multiple questions on one step.
  return fieldsFor(options).map((field,index)=>`<section data-step="${index+1}" ${jsx?'tabIndex':'tabindex'}="-1"${index?' hidden':''}>\n${fieldMarkup([field],jsx)}\n</section>`).join("\n");
}
function controls(session:boolean) {
  return `${session?'<p data-progress="" aria-live="polite"></p><button type="button" data-back="">Back</button><button type="button" data-next="">Next</button><button type="button" data-save="">Save draft</button>\n':''}<button type="submit">Submit</button>
<button type="button" data-retry="" hidden>Retry request</button>
<button type="button" data-reload="" hidden>Load saved answers</button>
<p role="status" aria-live="polite"></p>`;
}
export function createBrowserJavaScriptSnippet(options:BrowserSnippetOptions,session=false) {
  return `<script>
${configurationSnippet(options)}
</script>
${options.protections.altchaEnabled?`<script type="module" src="${html(altchaScriptUrl(options.challengeUrl))}"></script>\n`:''}<form id="forman-form" novalidate>
<fieldset data-fields="">
${session?sessionFieldMarkup(options):fieldMarkup(fieldsFor(options))}
</fieldset>
${proofMarkup(options)}
${controls(session)}
</form>
<script>
${session?integrationController:oneShotController}
mountIntegration(document.getElementById('forman-form'), config);
</script>`;
}
export function createReactJsxSnippet(options:BrowserSnippetOptions,session=false) {
  return `"use client";
import { useEffect, useRef } from "react";

${configurationSnippet(options)}

${session?integrationController:oneShotController}

export function SourceForm() {
  const formRef = useRef(null);
  useEffect(() => {
${options.protections.altchaEnabled?`    const src = ${scriptJson(altchaScriptUrl(options.challengeUrl))};
    if (![...document.scripts].some(script => script.src === src)) {
      const script = document.createElement('script'); script.type = 'module'; script.src = src;
      document.head.appendChild(script);
    }\n`:''}    return mountIntegration(formRef.current, config);
  }, []);
  return (
    <form ref={formRef} noValidate>
      <fieldset data-fields="">
${session?sessionFieldMarkup(options,true):fieldMarkup(fieldsFor(options),true)}
      </fieldset>
${proofMarkup(options,true)}
${controls(session)}
    </form>
  );
}`;
}
export function createMachineToMachineSnippet(m2mUrl:string,isProduction=process.env.NODE_ENV==='production',payload:Record<string,unknown>=integrationFields().payload) {
  const data=JSON.stringify(payload).replaceAll("'", "'\\''");
  return `curl --request POST "${m2mUrl}" \\\n  --header "Authorization: Bearer $FORMAN_SERVER_TOKEN" \\\n  --header "Content-Type: application/json" \\\n  --data '${data}'${isProduction?'':' \\\n  --insecure'}`;
}
export function createPopupSourceSnippet({sourceId,sourceName,popupScriptUrl,fields}:{sourceId:string;sourceName:string;popupScriptUrl:string;fields?:IntegrationField[]}) {
  const popupFields=fieldsFor({fields}).map(f=>({
    name:f.name,label:f.label,dataType:f.type,
    type:f.options?'select':f.type==='boolean'?'checkbox':f.type==='array'||f.type==='object'?'textarea':f.type==='number'||f.type==='integer'?'number':f.format==='email'?'email':'text',
    required:f.required,
    ...(f.type==='number'||f.type==='integer'?{step:f.type==='integer'?'1':'any'}:{}),
    ...(f.options?{options:f.options.map(value=>({label:String(value),value:f.type==='array'||f.type==='object'?JSON.stringify(value):String(value)}))}:{}),
  }));
  return `<script src="${html(popupScriptUrl)}" defer></script>
<script>
window.forman = window.forman || function () { (forman.q = forman.q || []).push(arguments); };
forman("create", {
  sourceId: ${scriptJson(sourceId)},
  title: ${scriptJson(sourceName)},
  fields: ${scriptJson(popupFields)},

  // Optional: uncomment and customize. Omitted settings use their defaults.
  // description: "", // Plain text below the title; empty = hidden. Default: "".
  // position: "bottom-right", // "bottom-right" | "bottom-left" | "center". Default: "bottom-right".
  // animation: "slide", // "slide" | "fade" | "none". Default: "slide"; respects reduced motion.
  // buttonColor: "#594aa5", // Six-digit hex color (#RRGGBB). Default: "#594aa5".
  // closeOnBackdrop: true, // true | false. Close on backdrop click. Default: true.
  // Messages accept non-empty plain text. Omit any key to keep its English default.
  // messages: { // Partial dictionary; supported keys and defaults are listed below.
  //   close: "Close form", // Accessible label for the close button.
  //   error: "Unable to submit the form. Please try again.", // Submission/network error; overrides server error text.
  //   preview: "Preview only. No data was sent.", // Confirmation in preview mode.
  //   sending: "Sending…", // Submission in progress.
  //   submit: "Submit", // Submit button; explicit submitLabel takes precedence.
  //   success: "Response submitted.", // Successful submission.
  //   verificationFailed: "Verification failed. Complete verification again.", // Rejected verification (HTTP 403).
  //   verificationRequired: "Complete verification first." // Missing CAPTCHA proof.
  // },
});
</script>`;
}
