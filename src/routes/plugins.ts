import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";

import { readVersionFiles } from "../registry/file-store.js";
import {
  findActiveVersionBySlugAndVersion,
  findAllActivePluginsWithLatestVersion,
  findLatestActiveVersion,
  getDependencySlugs,
} from "../registry/plugins-repository.js";
import {
  pluginBundleResponseSchema,
  pluginListResponseSchema,
  pluginSlugVersionParamsSchema,
} from "../registry/plugin-schemas.js";
import { errorResponseSchema } from "../registry/schemas.js";

function detectEncoding(content: Buffer): { encoding: "utf8" | "base64"; text: string } {
  const decoded = content.toString("utf8");
  const roundTrips = Buffer.from(decoded, "utf8").equals(content);
  return roundTrips ? { encoding: "utf8", text: decoded } : { encoding: "base64", text: content.toString("base64") };
}

const pluginsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const orm = fastify.orm;

  // Листинг для closet-cli list --all (plan.md, раздел 3 п.2): без query-параметров и без
  // rate limit — как и у GET /plugins/:slug/:version, отдельного лимита на чтение нет.
  fastify.get(
    "/plugins",
    {
      schema: {
        response: {
          200: pluginListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const plugins = await findAllActivePluginsWithLatestVersion(orm);
      reply.send({
        plugins: plugins.map((plugin) => ({
          slug: plugin.slug,
          description: plugin.description,
          latestVersion: plugin.latestVersion,
          updatedAt: plugin.updatedAt.toISOString(),
        })),
      });
    },
  );

  fastify.get(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginSlugVersionParamsSchema,
        response: {
          200: pluginBundleResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { slug, version } = request.params;

      const pluginVersion =
        version === "latest"
          ? await findLatestActiveVersion(orm, slug)
          : await findActiveVersionBySlugAndVersion(orm, slug, version);

      if (!pluginVersion) {
        reply.code(404).send({ error: `Plugin ${slug}@${version} not found` });
        return;
      }

      const dependencies = await getDependencySlugs(orm, pluginVersion.plugin.id);
      const locations = pluginVersion.files.map((file) => ({
        component: file.component,
        ai: file.ai,
        relativePath: file.relativePath,
      }));

      try {
        const filesWithContent = await readVersionFiles(slug, pluginVersion.version, locations);

        const files = pluginVersion.files.map((meta, index) => {
          const fileContent = filesWithContent[index];
          if (!fileContent) {
            throw new Error("readVersionFiles вернул меньше файлов, чем было запрошено");
          }

          const { encoding, text } = detectEncoding(fileContent.content);

          return {
            component: meta.component,
            ai: meta.ai,
            relativePath: meta.relativePath,
            rootPath: meta.rootPath,
            merge: meta.merge,
            mergeKeyPath: meta.mergeKeyPath,
            template: meta.template,
            sha256: meta.sha256,
            sizeBytes: meta.sizeBytes,
            encoding,
            content: text,
          };
        });

        reply.send({
          slug: pluginVersion.plugin.slug,
          description: pluginVersion.plugin.description,
          version: pluginVersion.version,
          changelog: pluginVersion.changelog,
          dependencies,
          files,
        });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "Failed to read plugin files from disk" });
      }
    },
  );
};

export default pluginsRoutes;
