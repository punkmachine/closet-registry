# Контекст сборки — корень монорепо (compose.yaml: context: .): pnpm-lock.yaml и
# pnpm-workspace.yaml лежат там, без них воспроизводимая установка невозможна.

FROM node:22-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Манифесты — отдельным слоем перед исходниками: правка кода не инвалидирует кеш установки.
# Манифест admin-panel копируется тоже, хотя его зависимости не ставятся: pnpm сверяет
# lockfile со ВСЕМИ importer'ами воркспейса и без этого файла падает на --frozen-lockfile.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/registry/package.json ./apps/registry/
COPY apps/admin-panel/package.json ./apps/admin-panel/

FROM manifests AS build
RUN pnpm install --frozen-lockfile --filter @closet/registry
COPY apps/registry ./apps/registry
RUN pnpm --filter @closet/registry build

FROM manifests AS runtime
ENV NODE_ENV=production
# --prod ставится заново, а не копируется из build-стадии: node_modules у pnpm — это дерево
# симлинков в .pnpm, и переносить его между стадиями надёжно сложнее, чем поставить ещё раз.
RUN pnpm install --frozen-lockfile --prod --filter @closet/registry && pnpm store prune

COPY --from=build /app/apps/registry/dist ./apps/registry/dist

# Содержимое плагинов — на томе, а не в образе: пересборка образа не должна терять файлы.
ENV REGISTRY_STORAGE_DIR=/data/plugins
RUN mkdir -p /data/plugins && chown -R node:node /data /app

USER node
WORKDIR /app/apps/registry
EXPOSE 3000

CMD ["node", "dist/server.js"]
