#!/bin/bash
# =============================================================================
# Telemetry Ping Script
# =============================================================================
#
# Sends an anonymous ping to track project adoption.
# This helps the maintainer understand how the project is being used.
#
# What is collected:
# - Your domain/hostname
# - Project version
# - Event type (install, startup)
# - Timestamp
#
# What is NOT collected:
# - IP addresses (not logged by the API)
# - Personal information
# - Database contents
# - Environment variables
#
# To opt-out, set TELEMETRY_DISABLED=true in your environment.
#
# See: https://github.com/chrishacia/chrishacia.com-nexjs#telemetry
# =============================================================================

set -e

# Configuration
TELEMETRY_ENDPOINT="${TELEMETRY_ENDPOINT:-https://chrishacia.com/api/telemetry}"
EVENT_TYPE="${1:-startup}"

# Check if telemetry is disabled
if [ "${TELEMETRY_DISABLED}" = "true" ] || [ "${TELEMETRY_DISABLED}" = "1" ]; then
  echo "📊 Telemetry disabled. Skipping ping."
  exit 0
fi

# Get the domain from environment or try to detect it
if [ -n "${NEXT_PUBLIC_APP_URL}" ]; then
  DOMAIN=$(echo "${NEXT_PUBLIC_APP_URL}" | sed -E 's|https?://||' | sed -E 's|/.*||')
elif [ -n "${SITE_URL}" ]; then
  DOMAIN=$(echo "${SITE_URL}" | sed -E 's|https?://||' | sed -E 's|/.*||')
elif [ -n "${DEPLOY_HOST}" ]; then
  DOMAIN="${DEPLOY_HOST}"
else
  DOMAIN="unknown"
fi

# Get version from package.json if available
if [ -f "package.json" ]; then
  VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' package.json | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
else
  VERSION="unknown"
fi

# Send the ping (fail silently - don't break the build/startup)
echo "📊 Sending telemetry ping (domain: ${DOMAIN}, version: ${VERSION}, event: ${EVENT_TYPE})"
echo "   To opt-out, set TELEMETRY_DISABLED=true"

curl -s -X POST "${TELEMETRY_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"${DOMAIN}\",\"version\":\"${VERSION}\",\"event\":\"${EVENT_TYPE}\"}" \
  --connect-timeout 5 \
  --max-time 10 \
  > /dev/null 2>&1 || true

echo "📊 Telemetry ping sent (or skipped if unreachable)"
