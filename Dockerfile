# =============================================================================
# Multi-stage Dockerfile for chrishacia.com Next.js Application
# Optimized for production deployment
# =============================================================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN pnpm build

# Create a flat production deployment for migrations (resolves pnpm symlink issues)
# The --legacy flag is required for pnpm v10 compatibility
RUN pnpm deploy --filter=. --prod --legacy /app/deploy

# =============================================================================
# Stage 3: Production Runner
# =============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

# Install build dependencies needed for native modules (bcryptjs)
RUN apk add --no-cache libc6-compat

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy migration infrastructure
COPY --from=builder /app/src/db/migrations ./migrations
COPY --from=builder /app/scripts/migrate.js ./migrate.js
COPY --from=builder /app/scripts/seed-admin.js ./seed-admin.js

# Copy telemetry script
RUN mkdir -p ./scripts
COPY --from=builder /app/scripts/telemetry-ping.sh ./scripts/telemetry-ping.sh
RUN chmod +x ./scripts/telemetry-ping.sh

# Copy all migration dependencies from pnpm deploy output (flat node_modules)
COPY --from=builder /app/deploy/node_modules ./node_modules

# Copy entrypoint script
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p ./public/uploads

# Set ownership of everything to nextjs user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application via entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]
