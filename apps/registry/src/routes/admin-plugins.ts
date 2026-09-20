import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";

import { PathTraversalError, writeVersionFiles } from "../registry/file-store.js";
import type { PluginFileUpload } from "../registry/file-store.js";
import { collectMultipartParts, formatZodError, parseMetadataJson } from "../registry/multipart-helpers.js";
import type { PluginFileInsert } from "../registry/plugins-repository.js";
import {
  findAnyVersion,
  findMissingDependencySlugs,
  PluginVersionConflictError,
  publishPluginVersion,
  softDeletePlugin,
  softDeleteVersion,
  toPluginVersionResult,
  upsertPluginVersion,
} from "../registry/plugins-repository.js";
import {
  pluginPublishMetadataSchema,
  pluginSlugParamsSchema,
  pluginSlugVersionParamsSchema,
  pluginUpdateMetadataSchema,
  pluginVersionResponseSchema,
} from "../registry/plugin-schemas.js";
import { errorResponseSchema } from "../registry/schemas.js";

type PluginFileMeta = z.infer<typeof pluginPublishMetadataSchema>["files"][number];

function buildFileKey(component: string, ai: string | null, relativePath: string): string {
  return `${component}::${ai ?? ""}::${relativePath}`;
}

function attachFileContents(
  files: PluginFileMeta[],
  fileBuffers: Map<string, Buffer>,
): { files: PluginFileUpload[]; missing: string[] } {
  const missing: string[] = [];
  const withContent: PluginFileUpload[] = [];

  for (const file of files) {
    const key = buildFileKey(file.component, file.ai, file.relativePath);
    const content = fileBuffers.get(key);
    if (!content) {
      missing.push(key);
      continue;
    }
    withContent.push({ component: file.component, ai: file.ai, relativePath: file.relativePath, content });
  }

  return { files: withContent, missing };
}

function buildFilesForInsert(
  metadataFiles: PluginFileMeta[],
  written: Awaited<ReturnType<typeof writeVersionFiles>>,
): PluginFileInsert[] {
  return metadataFiles.map((file, index) => {
    const writtenFile = written[index];
    if (!writtenFile) {
      throw new Error("writeVersionFiles вернул меньше файлов, чем было передано на вход");
    }

    return {
      component: file.component,
      ai: file.ai,
      relativePath: file.relativePath,
      storagePath: writtenFile.storagePath,
      sha256: writtenFile.sha256,
      sizeBytes: String(writtenFile.sizeBytes),
      rootPath: file.rootPath,
      merge: file.merge,
      mergeKeyPath: file.mergeKeyPath ?? null,
      template: file.template,
    };
  });
}

const adminRateLimitConfig = { rateLimit: { max: 300, timeWindow: "1 minute" } };

const adminPluginsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const orm = fastify.orm;

  fastify.post(
    "/plugins",
    {
      schema: {
        response: {
          201: pluginVersionResponseSchema,
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

      const result = pluginPublishMetadataSchema.safeParse(parsedJson.value);
      if (!result.success) {
        reply.code(400).send({ error: formatZodError(result.error) });
        return;
      }
      const body = result.data;

      const { files: filesWithContent, missing } = attachFileContents(body.files, fileBuffers);
      if (missing.length > 0) {
        reply.code(400).send({ error: `Missing file content for: ${missing.join(", ")}` });
        return;
      }

      const missingDeps = await findMissingDependencySlugs(orm, body.dependencies);
      if (missingDeps.length > 0) {
        reply.code(404).send({ error: `Unknown dependencies: ${missingDeps.join(", ")}` });
        return;
      }

      const existingVersion = await findAnyVersion(orm, body.slug, body.version);
      if (existingVersion) {
        reply.code(409).send({ error: `Plugin ${body.slug}@${body.version} already exists` });
        return;
      }

      let written;
      try {
        written = await writeVersionFiles(body.slug, body.version, filesWithContent);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          reply.code(400).send({ error: error.message });
          return;
        }
        throw error;
      }

      try {
        const { plugin, version } = await publishPluginVersion(orm, {
          slug: body.slug,
          description: body.description,
          version: body.version,
          changelog: body.changelog ?? null,
          dependencySlugs: body.dependencies,
          files: buildFilesForInsert(body.files, written),
        });

        reply.code(201).send(toPluginVersionResult(plugin, version, body.dependencies));
      } catch (error) {
        if (error instanceof PluginVersionConflictError) {
          reply.code(409).send({ error: error.message });
          return;
        }
        throw error;
      }
    },
  );

  fastify.put(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginSlugVersionParamsSchema,
        response: {
          200: pluginVersionResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { slug, version } = request.params;

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

      const result = pluginUpdateMetadataSchema.safeParse(parsedJson.value);
      if (!result.success) {
        reply.code(400).send({ error: formatZodError(result.error) });
        return;
      }
      const body = result.data;

      if ((body.slug !== undefined && body.slug !== slug) || (body.version !== undefined && body.version !== version)) {
        reply.code(400).send({ error: "slug/version в metadata должны совпадать с URL" });
        return;
      }

      const { files: filesWithContent, missing } = attachFileContents(body.files, fileBuffers);
      if (missing.length > 0) {
        reply.code(400).send({ error: `Missing file content for: ${missing.join(", ")}` });
        return;
      }

      const missingDeps = await findMissingDependencySlugs(orm, body.dependencies);
      if (missingDeps.length > 0) {
        reply.code(404).send({ error: `Unknown dependencies: ${missingDeps.join(", ")}` });
        return;
      }

      let written;
      try {
        written = await writeVersionFiles(slug, version, filesWithContent);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          reply.code(400).send({ error: error.message });
          return;
        }
        throw error;
      }

      const { plugin, version: savedVersion } = await upsertPluginVersion(orm, {
        slug,
        description: body.description,
        version,
        changelog: body.changelog ?? null,
        dependencySlugs: body.dependencies,
        files: buildFilesForInsert(body.files, written),
      });

      reply.code(200).send(toPluginVersionResult(plugin, savedVersion, body.dependencies));
    },
  );

  fastify.delete(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginSlugVersionParamsSchema,
        response: {
          204: z.void(),
          404: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { slug, version } = request.params;

      const deleted = await softDeleteVersion(orm, slug, version);
      if (!deleted) {
        reply.code(404).send({ error: `Plugin ${slug}@${version} not found` });
        return;
      }

      reply.code(204).send();
    },
  );

  fastify.delete(
    "/plugins/:slug",
    {
      schema: {
        params: pluginSlugParamsSchema,
        response: {
          204: z.void(),
          404: errorResponseSchema,
        },
      },
      config: adminRateLimitConfig,
    },
    async (request, reply) => {
      const { slug } = request.params;

      const deleted = await softDeletePlugin(orm, slug);
      if (!deleted) {
        reply.code(404).send({ error: `Plugin ${slug} not found` });
        return;
      }

      reply.code(204).send();
    },
  );
};

export default adminPluginsRoutes;
