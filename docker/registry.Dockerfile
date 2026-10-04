FROM node:22-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/registry/package.json ./apps/registry/
COPY apps/admin-panel/package.json ./apps/admin-panel/
COPY packages/config/package.json ./packages/config/
COPY packages/contract/package.json ./packages/contract/
COPY packages/ui/package.json ./packages/ui/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter "@closet/registry..."
COPY packages/config ./packages/config
COPY packages/contract ./packages/contract
COPY apps/registry ./apps/registry
RUN pnpm --filter @closet/contract build && pnpm --filter @closet/registry build

FROM manifests AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter "@closet/registry..." && pnpm store prune

COPY --from=build /app/packages/contract/dist ./packages/contract/dist
COPY --from=build /app/apps/registry/dist ./apps/registry/dist

ENV REGISTRY_STORAGE_DIR=/data/plugins
RUN mkdir -p /data/plugins && chown -R node:node /data /app

USER node
WORKDIR /app/apps/registry
EXPOSE 3000

CMD ["node", "dist/server.js"]
