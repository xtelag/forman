import { afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../../../helpers/database";
import { createSource } from "@/server/sources/source-service";
import { createPipeline, getPipeline, updatePipelineAction } from "@/server/pipelines/pipeline-service";
import { preparePipelineRuns, insertPreparedPipelineRuns } from "@/server/pipelines/pipeline-run-service";
import { runPipelines } from "@/server/pipelines/pipeline-run-worker";
import { pipelineActionRuns, pipelineActions, submissions } from "@/server/db/schema";
const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.dispose()));
const config = { url: "https://db.example.test", database: "forman", username: "forman", password: "private-test-password" };
test("archives original intake, preserves downstream payload, masks passwords and retains saved credentials", async () => {
 const db = createTestDatabase(); databases.push(db);
 const source = await createSource(db.db, {type:"one-shot",name:"Archive test"});
 const pipeline = (await createPipeline(db.db,{name:"Archive",sourceId:source.id,steps:[{type:"transformation",name:"Transform",configuration:{expression:'{"name":"Changed"}'}},{type:"couchdb",name:"Archive",configuration:config},{type:"inbox",name:"Inbox"}]}))!;
 expect(JSON.stringify(pipeline)).not.toContain(config.password);
 expect("configuration" in pipeline.steps[1] && pipeline.steps[1].configuration).toMatchObject({passwordConfigured:true});
 const payload = {name:"Original",choices:["a","b"]};
 const now = new Date();
 db.db.insert(submissions).values({id:"archive-submission",sourceId:source.id,payloadJson:JSON.stringify(payload),createdAt:now}).run();
 insertPreparedPipelineRuns(db.db,"archive-submission",await preparePipelineRuns(db.db,{sourceId:source.id,payload,createdAt:now}));
 await updatePipelineAction(db.db,pipeline.id,pipeline.steps[1].id,{name:"Archive",type:"couchdb",configuration:{...config,password:""}});
 expect(JSON.parse(db.db.select().from(pipelineActions).where(eq(pipelineActions.id,pipeline.steps[1].id)).get()!.configurationJson).password).toBe(config.password);
 // Later edits cannot redirect a snapshotted run.
 await updatePipelineAction(db.db,pipeline.id,pipeline.steps[1].id,{name:"Archive",type:"couchdb",configuration:{...config,url:"https://other.example.test",password:"replacement"}});
 const send = vi.fn(async (input: {body:string}) => ({status:201,body:JSON.stringify({ok:true,id:JSON.parse(input.body)._id,rev:"1-test"})}));
 await runPipelines({database:db.db,sendWebhook:send});
 const document = JSON.parse(send.mock.calls[0][0].body);
 expect(document).toMatchObject({submissionId:"archive-submission",sourceId:source.sourceId,payload});
 expect(send.mock.calls[0][0]).toMatchObject({url:"https://db.example.test/forman/submission%3Aarchive-submission"});
 const archived = db.db.select().from(pipelineActionRuns).where(eq(pipelineActionRuns.type,"couchdb")).get()!;
 expect(archived.status).toBe("completed");
 expect(JSON.parse(archived.outputPayloadJson!)).toEqual({name:"Changed",choices:["a","b"]});
 expect(JSON.stringify(await getPipeline(db.db,pipeline.id))).not.toContain("replacement");

});
test.each(["http://db.example.test","https://user:secret@db.example.test","https://db.example.test?token=secret"])("rejects unsafe target configuration %s", async url => {
 const db = createTestDatabase(); databases.push(db);
 const source = await createSource(db.db,{name:"Validate",type:"one-shot"});
 await expect(createPipeline(db.db,{name:"Archive",sourceId:source.id,steps:[{name:"Archive",type:"couchdb",configuration:{...config,url}}]})).rejects.toThrow("CouchDB requires");
});
