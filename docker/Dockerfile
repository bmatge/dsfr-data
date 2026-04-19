# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/favorites/package.json apps/favorites/
COPY apps/playground/package.json apps/playground/
COPY apps/sources/package.json apps/sources/
COPY apps/builder-ia/package.json apps/builder-ia/
COPY apps/builder/package.json apps/builder/
COPY apps/builder-carto/package.json apps/builder-carto/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/monitoring/package.json apps/monitoring/
COPY apps/admin/package.json apps/admin/
COPY apps/pipeline-helper/package.json apps/pipeline-helper/
RUN npm ci
COPY . .
RUN npm run build:all
RUN node scripts/build-app.js

# Build MCP server (separate package, outside workspace)
RUN cd mcp-server && npm ci && npm run build

# Production stage — nginx non-root + MCP server.
# L'image `nginxinc/nginx-unprivileged:alpine` tourne en utilisateur `nginx`
# (uid 101) et écoute sur 8080 par défaut — aucun privilège root requis.
# Ferme le finding Trivy DS-0002. Cf. issue #66.
FROM nginxinc/nginx-unprivileged:alpine

# Les installs + copies doivent se faire en root ; on reviendra à `nginx`
# en fin de stage pour le runtime.
USER root

# Add Node.js for the MCP server
RUN apk add --no-cache nodejs

# Copier la config nginx + le snippet security-headers (inclus dans chaque
# location block — cf. docker/security-headers.conf pour le pourquoi)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
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

# IA default proxy server (serves /ia-server-config and /ia-proxy-default)
COPY scripts/ia-default-server.js /app/scripts/ia-default-server.js

# Donner à l'utilisateur `nginx` l'écriture sur les répertoires de cache,
# de logs (beacon-logs volume) et le workspace /app (MCP + ia-default).
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /app \
 && chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/parse-beacon-logs.sh

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
