import {afterEach,expect,test,vi} from "vitest";
import {waitFor} from "@testing-library/react";
import {integrationController, oneShotController} from "@/server/sources/integration-controller";
const disposers:Array<()=>void>=[];
afterEach(()=>{disposers.splice(0).forEach(dispose=>dispose());vi.unstubAllGlobals();document.body.innerHTML="";history.replaceState(null,"","/");});
function setup(returning=false){
 if(returning)history.replaceState(null,"","/#session="+"a".repeat(43));
 document.body.innerHTML='<form><fieldset data-fields><input name="name" value="Ada" required></fieldset><div data-protection><input name="trap" value=""><input name="altcha" value="proof"></div><button type="button" data-save>Save</button><button type="submit">Submit</button><button type="button" data-retry>Retry</button><button type="button" data-reload>Reload</button><p role="status"></p></form>';
 const form=document.querySelector('form')!;
 const mount=new Function(integrationController+'; return mountIntegration;')();
 disposers.push(mount(form,{endpoint:"https://forman.test/api/submit/source",fields:[{name:"name",type:"string"}],honeypotFieldNames:["trap"],altcha:true}));
 return {form,click:(selector:string)=>(form.querySelector(selector) as HTMLButtonElement).click(),status:()=>form.querySelector('[role="status"]')!.textContent};
}
const draft=(revision=0,payload={name:"Ada"})=>({status:"draft",revision,payload,meta:{currentPage:3}});
test("creation reads honeypot once, updates omit protections and finalizes the same key",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(draft())).mockResolvedValueOnce(Response.json(draft(1))).mockResolvedValueOnce(Response.json({...draft(2),status:"completed"}));vi.stubGlobal('fetch',fetcher);
 const ui=setup();ui.click('[data-save]');
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(ui.status()).toMatch(/Draft saved/));
 const bodies=()=>fetcher.mock.calls.map(call=>JSON.parse(call[1].body));
 expect(bodies()[0]).toMatchObject({operation:"open",protection:{honeypot:{trap:""},altcha:"proof"}});
 expect(bodies()[1]).toMatchObject({operation:"update",payload:{name:"Ada"},final:false,currentPage:3});
 expect(bodies()[1]).not.toHaveProperty('protection');
 expect(location.hash).toMatch(/^#session=/);
 expect(bodies()[0].sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
 expect(bodies()[0].sessionId).toBe(new URLSearchParams(location.hash.slice(1)).get('session'));
 ui.form.dispatchEvent(new Event('submit',{cancelable:true}));
 await waitFor(()=>expect(ui.status()).toBe('Response submitted.'));
 expect(bodies()[2]).toMatchObject({revision:1,final:true});
 expect(bodies()[2].sessionId).toBe(bodies()[0].sessionId);
});
test("network failure retries exactly the same operation and locks local fields",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(draft())).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(Response.json(draft(1)));vi.stubGlobal('fetch',fetcher);
 const ui=setup();ui.click('[data-save]');
 await waitFor(()=>expect(ui.status()).toContain('offline'));
 expect(ui.form.querySelector('fieldset')).toBeDisabled();
 ui.click('[data-retry]');
 await waitFor(()=>expect(ui.status()).toMatch(/Draft saved/));
 expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});
test("resume reads answers without opening; conflict requires explicit replacement",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json(draft(2,{name:"Saved"}))).mockResolvedValueOnce(Response.json({error:"Conflict"},{status:409})).mockResolvedValueOnce(Response.json(draft(3,{name:"Other device"})));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('confirm',vi.fn(()=>true));
 const ui=setup(true);
 await waitFor(()=>expect((ui.form.elements.namedItem('name') as HTMLInputElement).value).toBe('Saved'));
 ui.click('[data-save]');
 await waitFor(()=>expect(ui.status()).toMatch(/changed elsewhere/));
 expect((ui.form.elements.namedItem('name') as HTMLInputElement).value).toBe('Saved');
 ui.click('[data-reload]');
 await waitFor(()=>expect((ui.form.elements.namedItem('name') as HTMLInputElement).value).toBe('Other device'));
 expect(fetcher.mock.calls.map(call=>JSON.parse(call[1].body).operation)).toEqual(['read','update','read']);
});
test.each([404,410])("unavailable resume %i never starts a new session",async(code)=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({error:"Unavailable"},{status:code}));vi.stubGlobal('fetch',fetcher);
 const ui=setup(true);await waitFor(()=>expect(ui.form.querySelector('[type="submit"]')).toBeDisabled());
 await waitFor(()=>expect(ui.status()).not.toBe('Working…'));
 ui.click('[data-save]');expect(fetcher).toHaveBeenCalledTimes(1);
});
test("rate limit respects Retry-After before retry",async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({error:"limited"},{status:429,headers:{'Retry-After':'60'}}));vi.stubGlobal('fetch',fetcher);
 const ui=setup(true);await waitFor(()=>expect(ui.status()).toMatch(/Too many/));
 expect(ui.form.querySelector('[data-retry]')).toBeDisabled();
});

test("uncertain initial open locks editing and submission until the same request recovers", async () => {
 const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
  .mockResolvedValueOnce(Response.json(draft()))
  .mockResolvedValueOnce(Response.json(draft(1)));
 vi.stubGlobal("fetch", fetcher);
 const ui = setup(); ui.click('[data-save]');
 await waitFor(() => expect(ui.status()).toContain("offline"));
 expect(ui.form.querySelector("fieldset")).toBeDisabled();
 expect(ui.form.querySelector('[type="submit"]')).toBeDisabled();
 ui.form.dispatchEvent(new Event("submit", { cancelable: true }));
 expect(fetcher).toHaveBeenCalledTimes(1);
 ui.click('[data-retry]');
 await waitFor(() => expect(ui.status()).toMatch(/Draft saved/));
 expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
 expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({payload:{name:"Ada"},final:false});
 expect(ui.form.querySelector("fieldset")).not.toBeDisabled();
});
test("definitive open rejection after an uncertain retry unlocks corrected input", async () => {
 const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
  .mockResolvedValueOnce(Response.json({error:"Invalid verification"},{status:400}))
  .mockResolvedValueOnce(Response.json(draft()))
  .mockResolvedValueOnce(Response.json(draft(1,{name:"Updated"})));
 vi.stubGlobal("fetch", fetcher);
 const ui = setup(); ui.click('[data-save]');
 await waitFor(() => expect(ui.status()).toContain("offline"));
 expect(ui.form.querySelector("fieldset")).toBeDisabled();
 ui.click('[data-retry]');
 await waitFor(() => expect(ui.status()).toContain("Invalid verification"));
 expect(ui.form.querySelector("fieldset")).not.toBeDisabled();
 (ui.form.elements.namedItem("name") as HTMLInputElement).value = "Updated";
 ui.click('[data-save]');
 await waitFor(() => expect(ui.status()).toMatch(/Draft saved/));
 expect(JSON.parse(fetcher.mock.calls[3][1].body).payload).toEqual({name:"Updated"});
});
test.each(["completed", "expired"])("uncertain open recovery stays closed for a %s session", async (state) => {
 const recovery = state === "completed"
  ? Response.json({...draft(),status:"completed"})
  : Response.json({error:"Expired"},{status:410});
 const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(recovery);
 vi.stubGlobal("fetch", fetcher);
 const ui = setup(); ui.click('[data-save]');
 await waitFor(() => expect(ui.status()).toContain("offline"));
 ui.click('[data-retry]');
 await waitFor(() => expect(ui.status()).toMatch(state === "completed" ? /Response submitted/ : /expired/));
 expect(ui.form.querySelector("fieldset")).toBeDisabled();
 expect(ui.form.querySelector('[type="submit"]')).toBeDisabled();
 expect(ui.form.querySelector('[data-retry]')).not.toBeVisible();
 ui.form.dispatchEvent(new Event("submit", { cancelable: true }));
 expect(fetcher).toHaveBeenCalledTimes(2);
});

test.each(["missing", "duplicate", "filled"])("rejects %s honeypot before sending", async mode => {
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher); const ui=setup();
 const trap=ui.form.elements.namedItem("trap") as HTMLInputElement;
 if(mode==="missing")trap.remove(); else if(mode==="duplicate")trap.after(trap.cloneNode()); else trap.value="bot";
 ui.click('[data-save]'); await waitFor(()=>expect(ui.status()).toMatch(/verification/i)); expect(fetcher).not.toHaveBeenCalled();
});
test("403 retains answers and resets verification", async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({error:"Rejected"},{status:403}));vi.stubGlobal("fetch",fetcher);
 const ui=setup();const widget=document.createElement("altcha-widget");const reset=vi.fn();Object.assign(widget,{reset});ui.form.append(widget);
 ui.click('[data-save]');await waitFor(()=>expect(reset).toHaveBeenCalled());
 expect((ui.form.elements.namedItem("name") as HTMLInputElement).value).toBe("Ada");expect(ui.status()).toMatch(/verification/i);
});

test.each(["missing", "duplicate", "filled", "rejected"])("one-shot integration preserves answers for %s verification", async mode => {
 document.body.innerHTML='<form><input name="name" value="Ada"><input name="trap" value=""><input name="other" value=""><input name="altcha" value="proof"><altcha-widget></altcha-widget><button type="submit">Submit</button><p role="status"></p></form>';
 const form=document.querySelector("form")!;const reset=vi.fn();Object.assign(form.querySelector("altcha-widget")!,{reset});
 const mount=new Function(oneShotController+'; return mountIntegration;')();disposers.push(mount(form,{endpoint:"/submit",fields:[{name:"name",type:"string"}],honeypotFieldNames:["trap","other"],altcha:true}));
 const fetcher=vi.fn().mockResolvedValue(Response.json({error:"Rejected"},{status:403}));vi.stubGlobal("fetch",fetcher);
 const trap=form.elements.namedItem("trap") as HTMLInputElement;
 if(mode==="missing")trap.remove();else if(mode==="duplicate")trap.after(trap.cloneNode());else if(mode==="filled")trap.value="bot";
 form.dispatchEvent(new Event("submit",{cancelable:true}));await waitFor(()=>expect(form.querySelector('[role="status"]')).toHaveTextContent(/verification/i));
 expect((form.elements.namedItem("name") as HTMLInputElement).value).toBe("Ada");
 if(mode==="rejected"){expect(reset).toHaveBeenCalledOnce();expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({trap:"",other:""});}else expect(fetcher).not.toHaveBeenCalled();
});
test("steps save destination, keep all answers and allow incomplete Back",async()=>{
 document.body.innerHTML='<form novalidate><fieldset data-fields><section data-step="1" tabindex="-1"><input name="name" value="Ada" required></section><section data-step="2" tabindex="-1" hidden><input name="email" required type="email"></section></fieldset><button type="button" data-back>Back</button><button type="button" data-next>Next</button><button type="button" data-save>Save</button><button type="submit">Submit</button><button type="button" data-retry>Retry</button><button type="button" data-reload>Reload</button><p data-progress></p><p role="status"></p></form>';
 const form=document.querySelector('form')!;
 const fetcher=vi.fn().mockImplementation(async (_url,options)=>{const body=JSON.parse(options.body);return Response.json({status:body.final?'completed':'draft',revision:1,payload:body.payload||{},meta:{currentPage:body.currentPage||1}})});
 vi.stubGlobal('fetch',fetcher);
 const mount=new Function(integrationController+'; return mountIntegration;')();
 disposers.push(mount(form,{endpoint:"https://forman.test/api/submit/source",fields:[{name:"name",type:"string"},{name:"email",type:"string"}],honeypotFieldNames:[],altcha:false}));
 (form.querySelector('[data-next]') as HTMLButtonElement).click();
 await waitFor(()=>expect(form.querySelector('[data-step="1"]')).not.toBeVisible());
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({currentPage:2,payload:{name:"Ada"},final:false});
 (form.querySelector('[data-back]') as HTMLButtonElement).click();
 await waitFor(()=>expect(form.querySelector('[data-step="1"]')).toBeVisible());
 expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({currentPage:1,payload:{name:"Ada"},final:false});
});
