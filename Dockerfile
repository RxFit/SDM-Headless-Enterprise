# ════════════════════════════════════════════════════════════════════════
# SDM Headless Enterprise — Multi-Stage Docker Build
# TASK_H01: Build + Runtime separation for minimal image size
# ════════════════════════════════════════════════════════════════════════

# ─── STAGE 1: Client Build ───────────────────────────────────────────
FROM node:22-alpine AS client-builder

WORKDIR /build/client

# Install client deps
COPY client/package*.json ./
RUN npm ci --legacy-peer-deps

# Copy and build client
COPY client/ ./
RUN npm run build

# ─── STAGE 2: Server Build ───────────────────────────────────────────
FROM node:22-alpine AS server-builder

WORKDIR /build

# Install all deps (including dev for typescript)
COPY package*.json ./
RUN npm ci

# Copy server source + configs
COPY server/ ./server/
COPY tsconfig.server.json ./

# Compile TypeScript
RUN ./node_modules/.bin/tsc -p tsconfig.server.json

# ─── STAGE 3: Production Runtime ─────────────────────────────────────
FROM node:22-alpine AS runtime

# Install git for gitSync (WOLF-002: batched commits)
RUN apk add --no-cache git

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled server
COPY --from=server-builder /build/dist ./dist

# Copy static client assets (served by Express)
COPY --from=client-builder /build/client/dist ./client/dist

# Copy initial data files (will be overridden by named volume in production)
COPY data/ ./data/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:${PORT:-8090}/api/v1/health | grep -q '"status":"healthy"' || exit 1

EXPOSE 8090

# Data directory permissions (WOLF-002: volume mount needs write access)
RUN mkdir -p /app/data/archive && chmod -R 777 /app/data

CMD ["node", "dist/server/index.js"]
