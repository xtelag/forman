import { z } from "zod";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";

import { findSourceBySourceId } from "./source-service";
import { replaceSourceTags } from "@/server/tags/tag-service";
import {
  deleteDeactivatedSource,
  setSourceEnabled,
  type SourceConfiguration,
  updateSourceConfiguration,
} from "./lifecycle-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];
type Dependencies = { database: FormanDatabase };
const stateSchema = z.object({ enabled: z.boolean() }).strict();
const sectionSchema = z.object({
  section: z.enum(["configuration", "advanced", "source-fields", "protection", "tags"]),
  values: z.record(z.string(), z.unknown()),
}).strict();

export function createAdminSourceLifecycleHandler({ database }: Dependencies) {
  async function authenticate(request: Request) {
    return getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
  }

  return {
    async configure(request: Request, publicSourceId: string) {
      if (!(await authenticate(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source) return Response.json({ error: "Not found" }, { status: 404 });
      const configuration = await request.json().catch(() => undefined);
      const result = await updateSourceConfiguration(database, source.id, configuration as SourceConfiguration);
      if (result === "friendly-name-conflict") {
        return Response.json({ error: "A Source with this name already exists" }, { status: 409 });
      }
      if (result !== "saved") {
        return Response.json({ error: typeof result === "object" ? result.error : "Invalid Source configuration" }, { status: 400 });
      }
      return Response.json(await findSourceBySourceId(database, publicSourceId));
    },
    async update(request: Request, publicSourceId: string) {
      if (!(await authenticate(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source) return Response.json({ error: "Not found" }, { status: 404 });
      const body = await request.json().catch(() => undefined);
      const state = stateSchema.safeParse(body);
      if (state.success) {
        await setSourceEnabled(database, source.id, state.data.enabled);
        return Response.json({ ...source, enabled: state.data.enabled });
      }
      const section = sectionSchema.safeParse(body);
      if (!section.success) return Response.json({ error: "Invalid Source update" }, { status: 400 });
      if (section.data.section === "tags") {
        const tagIds = z.array(z.string().min(1)).max(100).safeParse(section.data.values.tagIds);
        if (!tagIds.success)
          return Response.json({ error: "Invalid Source tags" }, { status: 400 });
        try {
          const tags = await replaceSourceTags(database, source.id, tagIds.data);
          return Response.json({ ...source, tags });
        } catch {
          return Response.json({ error: "One or more tags no longer exist" }, { status: 400 });
        }
      }
      const result = await updateSourceConfiguration(database, source.id, section.data.values, true);
      if (result === "friendly-name-conflict") return Response.json({ error: "A Source with this name already exists" }, { status: 409 });
      if (result !== "saved") return Response.json({ error: typeof result === "object" ? result.error : "Invalid Source update" }, { status: 400 });
      return Response.json(await findSourceBySourceId(database, publicSourceId));
    },
    async delete(request: Request, publicSourceId: string) {
      if (!(await authenticate(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const source = await findSourceBySourceId(database, publicSourceId);
      if (!source) return Response.json({ error: "Not found" }, { status: 404 });
      if (!(await deleteDeactivatedSource(database, source.id))) {
        return Response.json({ error: "Deactivate this Source before deletion" }, { status: 409 });
      }
      return new Response(null, { status: 204 });
    },
  };
}
