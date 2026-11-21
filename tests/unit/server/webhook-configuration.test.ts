import {expect,test} from "vitest";
import {normalizeWebhookConfiguration,renderWebhookUrl,webhookAuthorization} from "@/server/pipelines/webhook-configuration";
test("preserves old POST Bearer configuration and supports explicit removal",()=>{
 expect(normalizeWebhookConfiguration({url:"https://example.test",bearerToken:"secret"})).toMatchObject({method:"POST",authentication:"bearer"});
 expect(normalizeWebhookConfiguration({url:"https://example.test",authentication:"none"},{bearerToken:"secret"})).not.toHaveProperty("bearerToken");
});
test("keeps saved Basic password and encodes authentication",()=>{
 const c=normalizeWebhookConfiguration({url:"https://example.test/{{meta.submissionId}}",method:"PUT",authentication:"basic",username:"name",password:""},{password:"secret"});
 expect(c).toMatchObject({method:"PUT",password:"secret"});
 expect(webhookAuthorization(c)).toEqual({authorization:`Basic ${Buffer.from("name:secret").toString("base64")}`});
});
test("encodes scalar template values without allowing URL structure changes",()=>{
 expect(renderWebhookUrl("https://example.test/{{meta.submissionId}}?q={{payload.value}}",{submissionId:"abc/def"},{value:"a&b#c"})).toBe("https://example.test/abc%2Fdef?q=a%26b%23c");
 for(const value of [undefined,[1],{},".."]){expect(()=>renderWebhookUrl("https://example.test/{{payload.value}}",{},{value})).toThrow();}
});
test.each(["http://example.test","https://{{payload.host}}/","https://user:pass@example.test/","https://example.test/{{bad}}","https://example.test/#fragment"])("rejects unsafe templates %s",url=>{
 expect(()=>normalizeWebhookConfiguration({url})).toThrow();
});
