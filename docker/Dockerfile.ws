# syntax=docker/dockerfile:1.7
# ─── Prostor ws-server (y-websocket + JWT + Redis pub/sub) ───
# docker build -f docker/Dockerfile.ws -t prostor-ws .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/ws-server/package.json apps/ws-server/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate && npm run build -w @prostor/ws-server

# Только production-зависимости, без Next.js/React из web-воркспейса
FROM base AS prod-deps
# Манифесты всех workspaces нужны npm ci для сверки с lock-файлом,
# но ставятся зависимости только перечисленных через --workspace.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/ws-server/package.json apps/ws-server/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db packages/db
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=@prostor/ws-server --workspace=@prostor/db --include-workspace-root=false \
 && npx --workspace=@prostor/db prisma generate \
 && mkdir -p apps/ws-server/node_modules
# Версии, конфликтующие с поднятыми в корень (напр. ws@6 из y-websocket в web), npm кладёт
# во вложенный node_modules воркспейса — без него рантайм подхватил бы чужую версию

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /app/apps/ws-server/node_modules ./apps/ws-server/node_modules
COPY --from=build --chown=app:app /app/apps/ws-server/dist ./apps/ws-server/dist
COPY --from=build --chown=app:app /app/apps/ws-server/package.json ./apps/ws-server/package.json

USER app
WORKDIR /app/apps/ws-server
EXPOSE 1234
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:1234/health || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
