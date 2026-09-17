# -------------------------------------------------------------
# Stage 1: Build the React + Vite frontend bundle
# -------------------------------------------------------------
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server application and runtime data
COPY server/ ./server/
COPY data/ ./data/

# Copy compiled frontend from builder stage
COPY --from=builder /app/dist ./dist

# Create runtime non-root user and ensure data directories have write permissions
RUN addgroup -S spotyspice && adduser -S spotyspice -G spotyspice && \
    mkdir -p /app/server/data && chown -R spotyspice:spotyspice /app

USER spotyspice

EXPOSE 3000

CMD ["node", "server/server.js"]
