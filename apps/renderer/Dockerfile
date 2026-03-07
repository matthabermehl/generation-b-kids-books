FROM node:22-alpine AS base
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/renderer/package.json apps/renderer/package.json
COPY apps/renderer/tsconfig.json apps/renderer/tsconfig.json
COPY apps/renderer/src ./apps/renderer/src
COPY packages/domain/package.json packages/domain/package.json
COPY packages/domain/tsconfig.json packages/domain/tsconfig.json
COPY packages/domain/src ./packages/domain/src

RUN pnpm install --filter @book/renderer... --frozen-lockfile
RUN pnpm --filter @book/renderer build

EXPOSE 8080
WORKDIR /app/apps/renderer
CMD ["node", "dist/server.js"]
