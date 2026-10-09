FROM node:22-bookworm-slim AS base

WORKDIR /app
RUN corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .
RUN pnpm run build

FROM base AS production
ENV NODE_ENV=production

# Native libraries required by the bundled Chromium PDF renderer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdbus-1-3 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 ffmpeg chromium \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/assets ./server/assets
COPY --from=build /app/docs/examples/msc-october-2026.json ./docs/examples/msc-october-2026.json

EXPOSE 5000

CMD ["sh", "-c", "node dist/migrate.cjs && node dist/index.cjs"]
