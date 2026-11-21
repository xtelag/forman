import { z } from "zod";

import { getAdministratorSessionFromCookie } from "@/server/auth/request-auth";
import type { createDatabase } from "@/server/db/client";

import {
  PipelineValidationError,
  createPipeline,
  createPipelineAction,
  createPipelineConfiguration,
  deletePipeline,
  deletePipelineAction,
  getPipeline,
  listPipelines,
  movePipelineAction,
  updatePipeline,
  updatePipelineAction,
  updatePipelineConfiguration,
} from "./pipeline-service";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export function createAdminPipelinesHandler({
  database,
}: {
  database: FormanDatabase;
}) {
  async function sessionFor(request: Request) {
    return getAdministratorSessionFromCookie(database, request.headers.get("cookie"));
  }

  function invalid(error: unknown) {
    return error instanceof z.ZodError || error instanceof PipelineValidationError || error instanceof Error && error.message === "Data Source not found";
  }

  return {
    async createAction(pipelineId: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      try {
        const pipeline = await createPipelineAction(database, pipelineId, await request.json().catch(() => undefined));
        if (!pipeline) return Response.json({ error: "Pipeline not found" }, { status: 404 });
        return Response.json(pipeline, { status: 201 });
      } catch (error) {
        if (invalid(error)) return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        throw error;
      }
    },
    async createConfiguration(request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      try {
        const pipeline = await createPipelineConfiguration(database, await request.json().catch(() => undefined));
        return Response.json(pipeline, { status: 201 });
      } catch (error) {
        if (invalid(error)) return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        throw error;
      }
    },
    async delete(id: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const result = await deletePipeline(database, id);
      if (result === "not_found") return Response.json({ error: "Pipeline not found" }, { status: 404 });
      if (result === "enabled") return Response.json({ error: "Disable the Pipeline before deleting it." }, { status: 409 });
      if (result === "active_runs") return Response.json({ error: "Wait until the Pipeline's Runs finish, then delete it." }, { status: 409 });
      return new Response(null, { status: 204 });
    },
    async deleteAction(pipelineId: string, actionId: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const pipeline = await deletePipelineAction(database, pipelineId, actionId);
      if (!pipeline) return Response.json({ error: "Action not found" }, { status: 404 });
      return Response.json(pipeline);
    },
    async get(id: string, request: Request) {
      const session = await getAdministratorSessionFromCookie(
        database,
        request.headers.get("cookie"),
      );
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const pipeline = await getPipeline(database, id);
      if (!pipeline) return Response.json({ error: "Pipeline not found" }, { status: 404 });
      return Response.json(pipeline);
    },
    async list(request: Request) {
      const session = await getAdministratorSessionFromCookie(
        database,
        request.headers.get("cookie"),
      );
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      return Response.json({ items: await listPipelines(database) });
    },
    async moveAction(pipelineId: string, actionId: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const direction = z.enum(["down", "up"]).safeParse((await request.json().catch(() => undefined))?.direction);
      if (!direction.success) return Response.json({ error: "Invalid Pipeline" }, { status: 400 });
      const pipeline = await movePipelineAction(database, pipelineId, actionId, direction.data);
      if (!pipeline) return Response.json({ error: "Action not found" }, { status: 404 });
      return Response.json(pipeline);
    },
    async updateAction(pipelineId: string, actionId: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      try {
        const pipeline = await updatePipelineAction(database, pipelineId, actionId, await request.json().catch(() => undefined));
        if (!pipeline) return Response.json({ error: "Action not found" }, { status: 404 });
        return Response.json(pipeline);
      } catch (error) {
        if (invalid(error)) return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        throw error;
      }
    },
    async updateConfiguration(id: string, request: Request) {
      if (!(await sessionFor(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
      try {
        const pipeline = await updatePipelineConfiguration(database, id, await request.json().catch(() => undefined));
        if (!pipeline) return Response.json({ error: "Pipeline not found" }, { status: 404 });
        return Response.json(pipeline);
      } catch (error) {
        if (invalid(error)) return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        throw error;
      }
    },
    async update(id: string, request: Request) {
      const session = await getAdministratorSessionFromCookie(
        database,
        request.headers.get("cookie"),
      );
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      try {
        const pipeline = await updatePipeline(
          database,
          id,
          await request.json().catch(() => undefined),
        );
        if (!pipeline) return Response.json({ error: "Pipeline not found" }, { status: 404 });
        return Response.json(pipeline);
      } catch (error) {
        if (
          error instanceof z.ZodError ||
          error instanceof Error &&
            (error.message === "Data Source not found" ||
              error.message === "An enabled Pipeline needs at least one enabled Action" ||
              error instanceof PipelineValidationError)
        ) {
          return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        }
        throw error;
      }
    },
    async create(request: Request) {
      const session = await getAdministratorSessionFromCookie(
        database,
        request.headers.get("cookie"),
      );
      if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

      try {
        const pipeline = await createPipeline(
          database,
          await request.json().catch(() => undefined),
        );
        return Response.json(pipeline, { status: 201 });
      } catch (error) {
        if (
          error instanceof z.ZodError ||
          error instanceof Error &&
            (error.message === "Data Source not found" ||
              error.message === "An enabled Pipeline needs at least one enabled Action" ||
              error instanceof PipelineValidationError)
        ) {
          return Response.json({ error: error instanceof PipelineValidationError && error.field === "expression" ? error.message : "Invalid Pipeline" }, { status: 400 });
        }
        throw error;
      }
    },
  };
}
