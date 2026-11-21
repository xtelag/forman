import { afterEach, describe, expect, test } from "vitest";

import {
  createPipelineAction,
  createPipelineConfiguration,
  deletePipelineAction,
  movePipelineAction,
  updatePipelineAction,
  updatePipelineConfiguration,
} from "@/server/pipelines/pipeline-service";
import { createSource } from "@/server/sources/source-service";
import { runMigrations } from "@/server/db/migrate";
import { createTestDatabase } from "../../../helpers/database";

describe("focused Pipeline configuration and Action changes", () => {
  const databases: ReturnType<typeof createTestDatabase>[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.dispose()));

  test("creates an empty Pipeline and saves configuration without Actions", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });

    const pipeline = await createPipelineConfiguration(database.db, { name: "Contact processing", sourceId: source.id });
    if (!pipeline) throw new Error("Pipeline was not created");
    expect(pipeline).toMatchObject({ enabled: true, name: "Contact processing", sourceId: source.id, steps: [] });

    await expect(updatePipelineConfiguration(database.db, pipeline.id, { enabled: false, name: "Paused contact processing" }))
      .resolves.toMatchObject({ enabled: false, name: "Paused contact processing", sourceId: source.id, steps: [] });
  });

  test("changes enabled independently and preserves it when renaming", async () => {
    const database=createTestDatabase();databases.push(database);
    const source=await createSource(database.db,{type:"one-shot",name:"Partial update"});
    const pipeline=await createPipelineConfiguration(database.db,{sourceId:source.id,name:"Original"});
    if(!pipeline) throw new Error("Missing fixture");
    await expect(updatePipelineConfiguration(database.db,pipeline.id,{enabled:false})).resolves.toMatchObject({enabled:false,name:"Original"});
    await expect(updatePipelineConfiguration(database.db,pipeline.id,{name:"Renamed"})).resolves.toMatchObject({enabled:false,name:"Renamed"});
  });
  test("creates, updates, moves, and deletes one Action without replacing siblings", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const pipeline = await createPipelineConfiguration(database.db, { name: "Contact processing", sourceId: source.id });
    if (!pipeline) throw new Error("Pipeline was not created");

    const first = await createPipelineAction(database.db, pipeline.id, { name: "Normalize", type: "transformation" });
    const second = await createPipelineAction(database.db, pipeline.id, { name: "Store", type: "inbox" });
    if (!first || !second) throw new Error("Actions were not created");
    const firstAction = first.steps[0]!;
    const secondAction = second.steps[1]!;

    const updated = await updatePipelineAction(database.db, pipeline.id, firstAction.id, {
      configuration: { expression: '{"normalized": payload.name}' },
      name: "Normalize payload",
      type: "transformation",
    });
    if (!updated) throw new Error("Action was not updated");
    expect(updated.steps).toMatchObject([
      { id: firstAction.id, name: "Normalize payload", position: 1 },
      { id: secondAction.id, name: "Store", position: 2 },
    ]);

    const moved = await movePipelineAction(database.db, pipeline.id, firstAction.id, "down");
    if (!moved) throw new Error("Action was not moved");
    expect(moved.steps).toMatchObject([
      { id: secondAction.id, name: "Store", position: 1 },
      { id: firstAction.id, name: "Normalize payload", position: 2 },
    ]);

    const deleted = await deletePipelineAction(database.db, pipeline.id, secondAction.id);
    if (!deleted) throw new Error("Action was not deleted");
    expect(deleted.steps).toMatchObject([{ id: firstAction.id, position: 1 }]);
  });
  test("rejects invalid Transformation syntax on create and update without changing saved Actions", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {type: "one-shot", name: "Syntax"});
    const pipeline = (await createPipelineConfiguration(database.db, {name: "Syntax", sourceId: source.id}))!;
    await expect(createPipelineAction(database.db, pipeline.id, {name: "Bad", type: "transformation", configuration: {expression: "("}})).rejects.toThrow(/JSONata/);
    const saved = (await createPipelineAction(database.db, pipeline.id, {name: "Good", type: "transformation", configuration: {expression: "{}"}}))!;
    await expect(updatePipelineAction(database.db, pipeline.id, saved.steps[0]!.id, {name: "Bad", type: "transformation", configuration: {expression: "("}})).rejects.toThrow(/JSONata/);
  });
  test("exposes a public Source ID separately from the relational ID", async () => {
    const database = createTestDatabase(); databases.push(database); runMigrations(database.db);
    const source = await createSource(database.db, {type: "one-shot", name: "Linked"});
    expect(await createPipelineConfiguration(database.db, {name: "Linked", sourceId: source.id})).toMatchObject({sourceId: source.id, sourcePublicId: source.sourceId});
  });

  test("stores Email presentation settings and rejects blank or multiline subjects", async () => {
    const database = createTestDatabase(); databases.push(database);
    const source = await createSource(database.db, { type: "one-shot", name: "Contact" });
    const pipeline = (await createPipelineConfiguration(database.db, { name: "Mail", sourceId: source.id }))!;
    const configuration = { recipients: ["to@example.test"], subject: "Contact enquiry", contentFormat: "formatted" };
    const saved = (await createPipelineAction(database.db, pipeline.id, { name: "Mail", type: "email", configuration }))!;
    expect(saved.steps[0]).toMatchObject({ configuration });
    for (const subject of ["", "   ", "Hello\r\nBcc: other@example.test"]) {
      await expect(updatePipelineAction(database.db, pipeline.id, saved.steps[0].id, { name: "Mail", type: "email", configuration: { ...configuration, subject } })).rejects.toThrow();
    }
    await expect(updatePipelineAction(database.db, pipeline.id, saved.steps[0].id, { name: "Mail", type: "email", configuration: { ...configuration, contentFormat: "invalid" } })).rejects.toThrow();
  });

});
