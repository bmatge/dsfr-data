# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/favorites/package.json apps/favorites/
COPY apps/playground/package.json apps/playground/
COPY apps/sources/package.json apps/sources/
COPY apps/builder-ia/package.json apps/builder-ia/
COPY apps/builder/package.json apps/builder/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/monitoring/package.json apps/monitoring/
RUN npm ci
COPY . .
RUN npm run build:all
RUN node scripts/build-app.js

# Build MCP server (separate package, outside workspace)
RUN cd mcp-server && npm ci && npm run build

# Production stage - Nginx + MCP server
FROM nginx:alpine

# Add Node.js for the MCP server
RUN apk add --no-cache nodejs

# Copier la config nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Ajouter le log_format beacon et le cache proxy (inclus dans le bloc http par nginx)
RUN echo "log_format beacon '\$time_iso8601|\$http_referer|\$arg_c|\$arg_t|\$remote_addr|\$arg_r';" > /etc/nginx/conf.d/beacon-log.conf \
 && echo "proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=5m;" > /etc/nginx/conf.d/cache.conf \
 && mkdir -p /var/cache/nginx/api

# Copier tous les fichiers depuis app-dist
COPY --from=builder /app/app-dist /usr/share/nginx/html

# Copier le MCP server (dist + deps)
COPY --from=builder /app/mcp-server/dist /app/mcp-server/dist
COPY --from=builder /app/mcp-server/node_modules /app/mcp-server/node_modules

# Copier les fichiers publics
COPY --from=builder /app/public /usr/share/nginx/html/public

# Scripts de monitoring (parsing beacon logs -> JSON)
COPY scripts/parse-beacon-logs.sh /usr/local/bin/parse-beacon-logs.sh
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
