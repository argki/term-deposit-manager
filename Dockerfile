# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest && corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi
COPY tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts ./
COPY index.html* ./
COPY assets ./assets
COPY public ./public
COPY src ./src
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3457
ENV DATA_DIR=/app/data

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --prod --frozen-lockfile; else pnpm install --prod; fi
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data
EXPOSE 3457

CMD ["node", "dist/server/index.js"]
