import { expect, test } from "vitest";
import { parseBrowserSubmission } from "@/server/submissions/browser-submission-service";

for (const count of [1, 2, 10]) {
  const names = Array.from({length:count}, (_,i)=>`trap_${i}`);
  const protections = {altchaEnabled:true,honeypotEnabled:true,honeypotFieldNames:names};
  for (const encoding of ["application/json", "application/x-www-form-urlencoded"]) {
    const encode = (entries:string[][]) => encoding === "application/json" ? `{${entries.map(([k,v])=>`${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",")}}` : new URLSearchParams(entries).toString();
    const entries = [["name","Ada"],["altcha","proof"],...names.map(n=>[n,""])];
    test(`${encoding} accepts ${count} traps and strips protections`,()=>{
      expect(parseBrowserSubmission(encoding,encode(entries),protections).payload).toEqual({name:"Ada"});
    });
    for(const mode of ["missing","filled","duplicate"]) test(`${encoding} rejects ${mode} trap among ${count}`,()=>{
      const altered=entries.map(e=>[...e]);
      if(mode==="missing") altered.pop();
      if(mode==="filled") altered[altered.length-1][1]="bot";
      if(mode==="duplicate") altered.push([names[0],""]);
      expect(()=>parseBrowserSubmission(encoding,encode(altered),protections)).toThrow("Verification failed");
    });
  }
}
