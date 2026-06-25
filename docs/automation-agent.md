# Automation Agent API

This feature allows a bot or AI agent to create/publish posts and moderate inbox messages via bearer-token secured endpoints.

## Security Model

- Off by default.
- Managed in admin at `/admin/settings` under the `Automation` tab.
- Token is stored as a SHA-256 hash, never plaintext.
- Token rotation generates a new token and shows it once.
- Token rotation now sets a 30-day expiry by default.
- Optional source IP allowlist support.
- HTTPS enforcement support for production ingress.
- Replay mitigation headers are required on every agent request.
- Per-endpoint rate limits are enforced.
- Input is validated with Zod and sanitized before writes.
- Agent actions are written to an audit event table.

## Configure It

1. Open admin settings and go to `Automation`.
2. Enable `Automation API`.
3. Enable the specific capabilities you want:
   - Post creation/publishing
   - Message retrieval
   - Message moderation
4. Optional: set a default post author.
5. Optional: allow caller-provided `authorId`.
6. Rotate token and save.
7. Copy the token shown once and store it in your bot secret manager.

## Auth Header

Use these headers on all automation requests:

```http
Authorization: Bearer <your-automation-token>
X-Agent-Timestamp: <unix-seconds>
X-Agent-Nonce: <unique-request-id>
```

Rules:

- `X-Agent-Timestamp` must be within +/- 5 minutes of server time.
- `X-Agent-Nonce` must be unique (one-time) in a 10-minute window.

## Endpoints

### POST /api/agent/posts

Creates a post and can publish immediately.

Request body:

```json
{
  "title": "New post from automation",
  "content": "# Hello\n\nThis was posted by an AI agent.",
  "status": "published",
  "tags": ["automation", "release"],
  "metaTitle": "Automation post",
  "metaDescription": "Posted via secure API"
}
```

Notes:

- `status` supports `draft` and `published`.
- If `allowCustomAuthor` is enabled, you can pass `authorId`.
- Slugs are auto-generated when omitted.

### GET /api/agent/messages

Reads inbox messages with pagination/filtering.

Query params:

- `page` (default `1`)
- `pageSize` (default `20`, max `100`)
- `status` (`unread`, `read`, `archived`, `spam`, `deleted`, or `all`)

### PATCH /api/agent/messages

Bulk moderation actions.

Request body:

```json
{
  "action": "spam",
  "ids": ["uuid-1", "uuid-2"]
}
```

Actions:

- `read`
- `unread`
- `archive`
- `spam`
- `delete` (soft delete)

## Operational Guidance

- Keep automation disabled unless needed.
- Rotate tokens immediately if leaked.
- Use narrowly scoped deployment secrets for each bot.
- Monitor app logs for repeated `401`/`429` responses.

## Curl Examples

Create and publish a post:

```bash
TS="$(date +%s)"
NONCE="$(uuidgen | tr '[:upper:]' '[:lower:]')"

curl -X POST "https://your-site.com/api/agent/posts" \
  -H "Authorization: Bearer ${AUTOMATION_TOKEN}" \
  -H "X-Agent-Timestamp: ${TS}" \
  -H "X-Agent-Nonce: ${NONCE}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Shipped: June Automation Update",
    "content": "# Update\\n\\nAutomation endpoint is live.",
    "status": "published",
    "tags": ["release", "automation"]
  }'
```

Fetch unread messages (page 1, 20 items):

```bash
TS="$(date +%s)"
NONCE="$(uuidgen | tr '[:upper:]' '[:lower:]')"

curl "https://your-site.com/api/agent/messages?page=1&pageSize=20&status=unread" \
  -H "Authorization: Bearer ${AUTOMATION_TOKEN}" \
  -H "X-Agent-Timestamp: ${TS}" \
  -H "X-Agent-Nonce: ${NONCE}"
```

Mark messages as spam:

```bash
TS="$(date +%s)"
NONCE="$(uuidgen | tr '[:upper:]' '[:lower:]')"

curl -X PATCH "https://your-site.com/api/agent/messages" \
  -H "Authorization: Bearer ${AUTOMATION_TOKEN}" \
  -H "X-Agent-Timestamp: ${TS}" \
  -H "X-Agent-Nonce: ${NONCE}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "spam",
    "ids": ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"]
  }'
```
