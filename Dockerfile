FROM node:20.20.0-bookworm-slim AS build

WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund \
    && npm exec --offline -- tsx --version

COPY . .
RUN npm run build

FROM node:20.20.0-bookworm-slim AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 5000

CMD ["sh", "-c", "node dist/migrate.cjs && node dist/index.cjs"]
