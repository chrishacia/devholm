#!/bin/sh
set -e

echo "🚀 Starting application..."

# Run database migrations
echo "📋 Running database migrations..."
if node /app/migrate.js; then
  echo "✅ Migrations complete"
else
  echo "⚠️ Migration failed, but continuing startup..."
fi

# Seed admin user only when explicitly allowed in production
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  if [ "$NODE_ENV" = "production" ] && [ "$ENABLE_ADMIN_SEED_ON_BOOT" != "true" ]; then
    echo "🔒 Skipping admin seed on production boot (set ENABLE_ADMIN_SEED_ON_BOOT=true to enable)"
  else
    echo "👤 Ensuring admin user exists..."
    node /app/seed-admin.js || echo "⚠️ Admin seeding skipped or failed"
  fi
fi

# Send telemetry ping (optional, disable with TELEMETRY_DISABLED=true)
if [ -f /app/scripts/telemetry-ping.sh ]; then
  echo "📊 Sending telemetry ping..."
  sh /app/scripts/telemetry-ping.sh startup || echo "⚠️ Telemetry ping failed (non-blocking)"
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
