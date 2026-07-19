# =============================================================================
# Multi-stage Dockerfile for chrishacia.com Next.js Application
# Optimized for production deployment
# =============================================================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies (HUSKY=0 disables prepare hook since .git isn't in build context)
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

ARG COMMIT_SHA=""
ARG REPO_SLUG=""

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV HUSKY=0
ENV DEVHOLM_PLUGIN_RESOLUTION_ENV=production
ENV COMMIT_SHA=${COMMIT_SHA}
ENV GITHUB_SHA=${COMMIT_SHA}
ENV REPO_SLUG=${REPO_SLUG}
ENV GITHUB_REPOSITORY=${REPO_SLUG}

# Build the application
RUN pnpm build

# Record build metadata derived from the canonical production preparation artifact
RUN node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync('/app/generated/plugins/production-build-preparation.json','utf8')); fs.writeFileSync('/app/generated/plugins/build-metadata.json', JSON.stringify({ commitSha: process.env.COMMIT_SHA, buildInputSetDigestSha256: manifest.buildInputSetDigestSha256, configurationDigestSha256: manifest.configurationDigestSha256, registryDigestSha256: manifest.registryDigestSha256, productionPreparationDigestSha256: manifest.contentDigestSha256 }, null, 2) + '\n')"

# Create a flat production deployment for migrations (resolves pnpm symlink issues)
# The --legacy flag is required for pnpm v10 compatibility
RUN pnpm deploy --filter=. --prod --legacy --config.strict-dep-builds=false /app/deploy

# =============================================================================
# Stage 3: Production Runner
# =============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ARG COMMIT_SHA=""

# Install build dependencies needed for native modules (bcryptjs)
RUN apk add --no-cache libc6-compat

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV COMMIT_SHA=${COMMIT_SHA}

LABEL org.opencontainers.image.revision=${COMMIT_SHA}
LABEL org.devholm.production-preparation=/app/generated/plugins/build-metadata.json

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Isolated runtime workers execute source TypeScript with tsx and rely on
# tsconfig path aliases (@core/*, @user/*) for module resolution.
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

# Copy migration infrastructure (TypeScript migration files kept with original names)
COPY --from=builder /app/src/core/db/migrations ./migrations
COPY --from=builder /app/src/user/extensions/db/migrations ./migrations/user
COPY --from=builder /app/generated/plugins ./generated/plugins
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
