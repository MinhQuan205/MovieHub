# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
# Build context phải là PROJECT ROOT (không phải backend/)
# Chạy từ root: docker build -f backend/Dockerfile .
#
# Nếu dùng Render.com: Root Directory = . (project root)
#                       Dockerfile Path = backend/Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package manifests trước (layer cache)
COPY backend/package*.json ./backend/

# Install tất cả deps (bao gồm devDeps để chạy tsc)
WORKDIR /app/backend
RUN npm ci

# Copy toàn bộ source — bao gồm cả shared/ ở root
WORKDIR /app
COPY backend/ ./backend/
COPY shared/ ./shared/

# Compile TypeScript (tsconfig rootDir=".." → output vào backend/dist/)
WORKDIR /app/backend
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# dumb-init: proper PID 1, signal forwarding, zombie reaping
RUN apk add --no-cache dumb-init

# Non-root user
RUN addgroup -S moviehub && adduser -S moviehub -G moviehub

WORKDIR /app

# Package manifests cho production install
COPY --chown=moviehub:moviehub backend/package*.json ./

# Production deps only
RUN npm ci --omit=dev

# Compiled JS từ builder
COPY --chown=moviehub:moviehub --from=builder /app/backend/dist ./dist

# swagger.yaml cần thiết cho swagger-ui-express lúc runtime
COPY --chown=moviehub:moviehub backend/swagger.yaml ./swagger.yaml

USER moviehub

EXPOSE 4000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/v1/health > /dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
# rootDir=".." → backend/src/server.ts → dist/backend/src/server.js
CMD ["node", "dist/backend/src/server.js"]
