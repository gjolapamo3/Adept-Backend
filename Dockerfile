# ==========================================
# Build Stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests first for optimal caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# ==========================================
# Production Runtime Stage
# ==========================================
FROM node:20-alpine

# Use unprivileged user for security
USER node
WORKDIR /usr/src/app

# Copy production dependencies and application code
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node . .

# Environment defaults
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check matching our GET /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
