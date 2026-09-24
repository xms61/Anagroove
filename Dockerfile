# -------------------------------------------------------------
# Stage 1: Build the React + Vite frontend bundle
# -------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and configuration files
COPY . .

# Build production assets into dist/
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Production runtime container
# -------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server application, shared logic, and runtime data
COPY server/ ./server/
COPY shared/ ./shared/
COPY data/ ./data/

# Copy compiled frontend from builder stage
COPY --from=builder /app/dist ./dist

# Runtime non-root user. It owns only DATA_DIR (server/data), the one place the server writes;
# code and dependencies stay root-owned, so the app cannot modify them
RUN addgroup -S anagroove && adduser -S anagroove -G anagroove && \
    mkdir -p /app/server/data && chown anagroove:anagroove /app/server/data

USER anagroove

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server/server.ts"]
