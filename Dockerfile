# Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# package-lock.json is slightly out of sync (webpack peer of @nestjs/cli); fall back to npm install
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Run as an unprivileged user with only production files
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT:-4000}/api/health || exit 1
# Runs migrations (RUN_MIGRATIONS=true), optional first-admin seed, then the API
CMD ["./docker-entrypoint.sh"]
