# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
# Workspace manifests first so the dependency layer caches; --ignore-scripts
# because packages/core's `prepare` would try to build before its sources exist.
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
RUN npm install --no-audit --no-fund --ignore-scripts
COPY tsconfig.json ./
COPY packages/core ./packages/core
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY packages/core/package.json ./packages/core/
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts && npm cache clean --force
# node_modules/@ikaros-arch/gnss-core is a symlink into packages/core, so ship its dist.
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/dist ./dist
COPY scripts/test-client.html ./scripts/test-client.html

# Drop privileges
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 9100/tcp
EXPOSE 9200/tcp

# Simple healthcheck against the REST endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9200/api/health || exit 1

CMD ["node", "dist/index.js"]
