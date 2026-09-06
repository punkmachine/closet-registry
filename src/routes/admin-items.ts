import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { deleteItemDir, deleteVersionDir, PathTraversalError, writeVersionFiles } from "../registry/file-store.js";
import {
  createItem,
  deleteAllVersions,
  deleteItemVersion,
  findMissingDependencies,
  getItemVersion,
  upsertItemVersion,
} from "../registry/items-repository.js";
import {
  errorResponseSchema,
  itemCreateMetadataSchema,
  itemMetadataSchema,
  itemNameParamsSchema,
  itemNameVersionParamsSchema,
  itemUpdateMetadataSchema,
} from "../registry/schemas.js";
import type { ItemFile, ItemFileUpload } from "../registry/types.js";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
  return `Validation error: ${issues}`;
}

async function collectMultipartParts(
  request: FastifyRequest,
): Promise<{ metadataRaw: unknown; fileBuffers: Map<string, Buffer> }> {
  const fileBuffers = new Map<string, Buffer>();
  let metadataRaw: unknown;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuffers.set(part.fieldname, await part.toBuffer());
    } else if (part.fieldname === "metadata") {
      metadataRaw = part.value;
    }
  }

  return { metadataRaw, fileBuffers };
}

function parseMetadataJson(metadataRaw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof metadataRaw !== "string") {
    return { ok: false, error: "Missing required 'metadata' field" };
  }

  try {
    return { ok: true, value: JSON.parse(metadataRaw) };
  } catch {
    return { ok: false, error: "'metadata' field must contain valid JSON" };
  }
}

function attachFileContents(
  files: ItemFile[],
  fileBuffers: Map<string, Buffer>,
): { files: ItemFileUpload[]; missing: string[] } {
  const missing: string[] = [];
  const withContent: ItemFileUpload[] = [];

  for (const file of files) {
    const content = fileBuffers.get(file.path);
    if (!content) {
      missing.push(file.path);
      continue;
    }
    withContent.push({ ...file, content });
  }

  return { files: withContent, missing };
}

const adminRateLimitConfig = { rateLimit: { max: 300, timeWindow: "1 minute" } };

const adminItemsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const pool = fastify.pg;

  fastify.post(
    "/items",
    {
      schema: {
        response: {
          201: itemMetadataSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      if (!request.isMultipart()) {
        reply.code(400).send({ error: "Expected multipart/form-data request" });
        return;
      }

      const { metadataRaw, fileBuffers } = await collectMultipartParts(request);

      const parsedJson = parseMetadataJson(metadataRaw);
      if (!parsedJson.ok) {
        reply.code(400).send({ error: parsedJson.error });
        return;
      }

      const result = itemCreateMetadataSchema.safeParse(parsedJson.value);
      if (!result.success) {
        reply.code(400).send({ error: formatZodError(result.error) });
        return;
      }
      const body = result.data;

      const { files: filesWithContent, missing } = attachFileContents(body.files, fileBuffers);
      if (missing.length > 0) {
        reply.code(400).send({ error: `Missing file content for path(s): ${missing.join(", ")}` });
        return;
      }

      const missingDeps = await findMissingDependencies(pool, body.dependencies);
      if (missingDeps.length > 0) {
        reply.code(400).send({ error: `Unknown dependencies: ${missingDeps.join(", ")}` });
        return;
      }

      const existing = await getItemVersion(pool, body.name, body.version);
      if (existing !== null) {
        reply.code(409).send({ error: `Item ${body.name}@${body.version} already exists` });
        return;
      }

      try {
        await writeVersionFiles(body.type, body.name, body.version, filesWithContent);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          reply.code(400).send({ error: error.message });
          return;
        }
        throw error;
      }

      try {
        const created = await createItem(pool, {
          name: body.name,
          type: body.type,
          version: body.version,
          description: body.description,
          dependencies: body.dependencies,
          files: body.files,
        });

        reply.code(201).send(created);
      } catch (error) {
        if (isUniqueViolation(error)) {
          reply.code(409).send({ error: `Item ${body.name}@${body.version} already exists` });
          return;
        }
        throw error;
      }
    },
  );

  fastify.put(
    "/items/:name/:version",
    {
      schema: {
        params: itemNameVersionParamsSchema,
        response: {
          200: itemMetadataSchema,
          400: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { name, version } = request.params;

      if (!request.isMultipart()) {
        reply.code(400).send({ error: "Expected multipart/form-data request" });
        return;
      }

      const { metadataRaw, fileBuffers } = await collectMultipartParts(request);

      const parsedJson = parseMetadataJson(metadataRaw);
      if (!parsedJson.ok) {
        reply.code(400).send({ error: parsedJson.error });
        return;
      }

      const result = itemUpdateMetadataSchema.safeParse(parsedJson.value);
      if (!result.success) {
        reply.code(400).send({ error: formatZodError(result.error) });
        return;
      }
      const body = result.data;

      if ((body.name !== undefined && body.name !== name) || (body.version !== undefined && body.version !== version)) {
        reply.code(400).send({ error: "name/version in metadata must match URL" });
        return;
      }

      const { files: filesWithContent, missing } = attachFileContents(body.files, fileBuffers);
      if (missing.length > 0) {
        reply.code(400).send({ error: `Missing file content for path(s): ${missing.join(", ")}` });
        return;
      }

      const missingDeps = await findMissingDependencies(pool, body.dependencies);
      if (missingDeps.length > 0) {
        reply.code(400).send({ error: `Unknown dependencies: ${missingDeps.join(", ")}` });
        return;
      }

      try {
        await writeVersionFiles(body.type, name, version, filesWithContent);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          reply.code(400).send({ error: error.message });
          return;
        }
        throw error;
      }

      const updated = await upsertItemVersion(pool, {
        name,
        type: body.type,
        version,
        description: body.description,
        dependencies: body.dependencies,
        files: body.files,
      });

      reply.code(200).send(updated);
    },
  );

  fastify.delete(
    "/items/:name/:version",
    {
      schema: {
        params: itemNameVersionParamsSchema,
        response: {
          204: z.void(),
          404: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { name, version } = request.params;

      const deleted = await deleteItemVersion(pool, name, version);
      if (deleted === null) {
        reply.code(404).send({ error: `Item ${name}@${version} not found` });
        return;
      }

      await deleteVersionDir(deleted.type, name, version);
      reply.code(204).send();
    },
  );

  fastify.delete(
    "/items/:name",
    {
      schema: {
        params: itemNameParamsSchema,
        response: {
          204: z.void(),
          404: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { name } = request.params;

      const deletedRows = await deleteAllVersions(pool, name);
      if (deletedRows.length === 0) {
        reply.code(404).send({ error: `Item ${name} not found` });
        return;
      }

      const [firstDeleted] = deletedRows;
      if (firstDeleted) {
        await deleteItemDir(firstDeleted.type, name);
      }
      reply.code(204).send();
    },
  );
};

export default adminItemsRoutes;
