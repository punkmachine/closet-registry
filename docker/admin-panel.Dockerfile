# Контекст сборки — корень монорепо (compose.yaml: context: .).

FROM node:22-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/registry/package.json ./apps/registry/
COPY apps/admin-panel/package.json ./apps/admin-panel/
RUN pnpm install --frozen-lockfile --filter @closet/admin-panel

COPY apps/admin-panel ./apps/admin-panel
RUN pnpm --filter @closet/admin-panel build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Nitro-сборка (.output) самодостаточна — зависимости вбандлены внутрь, поэтому
# в рантайме нет ни pnpm, ни node_modules, ни исходников.
COPY --from=build /app/apps/admin-panel/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
