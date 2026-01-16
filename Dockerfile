# ==============================================================================
# MyLeaf Dockerfile - Simplified for faster builds
# ==============================================================================

# Stage 1: Build Next.js
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runtime

# Install tectonic from pre-built binary
RUN apk add --no-cache curl bash \
    && curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xzf - -C /usr/local/bin \
    && chmod +x /usr/local/bin/tectonic \
    && tectonic --version

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3002 1234

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3002/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
