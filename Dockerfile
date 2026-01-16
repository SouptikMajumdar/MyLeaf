# ==============================================================================
# MyLeaf Dockerfile - Production Build
# ==============================================================================
# Features:
# - Next.js app with authentication & project management
# - Prisma ORM with PostgreSQL (Supabase)
# - Real-time collaboration server with auth
# - Tectonic LaTeX compilation engine
# ==============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# Build Next.js (prisma generate already done in deps stage)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    bash \
    wget \
    && rm -rf /var/cache/apk/*

# Detect architecture and install appropriate tectonic binary
RUN ARCH=$(uname -m) && \
    echo "Detected architecture: $ARCH" && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        TECTONIC_URL="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.15.0/tectonic-0.15.0-aarch64-unknown-linux-musl.tar.gz"; \
    elif [ "$ARCH" = "x86_64" ]; then \
        TECTONIC_URL="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic@0.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    echo "Downloading tectonic from: $TECTONIC_URL" && \
    curl -fsSL "$TECTONIC_URL" | tar -xzf - -C /usr/local/bin && \
    chmod +x /usr/local/bin/tectonic && \
    tectonic --version

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Prisma schema and generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy collaboration server and its dependencies
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY --from=builder /app/node_modules/yjs ./node_modules/yjs
COPY --from=builder /app/node_modules/y-protocols ./node_modules/y-protocols
COPY --from=builder /app/node_modules/lib0 ./node_modules/lib0
COPY --from=builder /app/node_modules/cookie ./node_modules/cookie

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app

# Set user
USER nextjs

# Environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3002
ENV WS_PORT=1234

# Expose ports
# 3002 - Next.js web app
# 1234 - WebSocket collaboration server
EXPOSE 3002 1234

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:3002/api/health || exit 1

# Run entrypoint
ENTRYPOINT ["./entrypoint.sh"]
