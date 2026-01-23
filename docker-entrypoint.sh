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

# Seed admin user if credentials provided
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "👤 Ensuring admin user exists..."
  node /app/seed-admin.js || echo "⚠️ Admin seeding skipped or failed"
fi

# Send telemetry ping (optional, disable with TELEMETRY_DISABLED=true)
if [ -f /app/scripts/telemetry-ping.sh ]; then
  echo "📊 Sending telemetry ping..."
  sh /app/scripts/telemetry-ping.sh startup || echo "⚠️ Telemetry ping failed (non-blocking)"
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
