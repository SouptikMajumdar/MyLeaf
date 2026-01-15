# ==============================================================================
# MyLeaf Dockerfile
# Multi-stage build for fast LaTeX compilation
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Next.js application
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production runtime with Tectonic
# ------------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Tectonic (musl binary for smaller size)
ARG TECTONIC_VERSION=0.15.0
RUN curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xzf - -C /usr/local/bin \
    && chmod +x /usr/local/bin/tectonic

# Pre-cache Tectonic bundles (downloads ~350MB of LaTeX packages)
# This makes first compile instant instead of waiting for downloads
RUN mkdir -p /tmp/tectonic-init && cd /tmp/tectonic-init \
    && echo '\documentclass{article}\begin{document}Hello\end{document}' > test.tex \
    && tectonic test.tex || true \
    && rm -rf /tmp/tectonic-init

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/myleaf.db
ENV NEXT_TELEMETRY_DISABLED=1

# Expose ports: Next.js (3000) and y-websocket (1234)
EXPOSE 3002 1234

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
