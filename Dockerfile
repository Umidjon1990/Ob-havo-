FROM node:20.20.0-bookworm-slim AS base

WORKDIR /app
RUN corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .
RUN pnpm run build

FROM base AS production
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist

EXPOSE 5000

CMD ["sh", "-c", "node dist/migrate.cjs && node dist/index.cjs"]
