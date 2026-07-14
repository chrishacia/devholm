# Marketplace Cache Retention and Mirror Administration

This document defines the operator-facing cache retention and mirror administration contract for DevHolm marketplace artifacts.

## Scope

This feature covers:

- cache policy defaults and validation
- deterministic cleanup planning
- cache pin protection
- mirror configuration and health visibility
- offline-safe cache posture signals
- integrity audit run tracking

This feature does not expand trust enrollment, public mirror discovery, commerce, ratings, or automated trust widening.

## Policy Contract

Policy is versioned and machine-validated.

Current version:

- `version`: `1`

Defaults (conservative):

- `maxCacheBytes`: `2147483648` (2 GiB)
- `maxArtifactAgeMs`: `2592000000` (30 days)
- `warnUsageRatio`: `0.9`
- `evictionBatchSize`: `250`

Validation requirements:

- unknown versions are rejected
- malformed values are rejected
- fail-safe reads return conservative defaults when persisted policy is unavailable or invalid

## Pinning Model

Cache pins are explicit and reasoned records.

Pin fields:

- `cache_key`
- `reason_code`
- `reason_detail`
- `owner_type`
- `owner_id`
- `created_by`
- `created_at`
- `released_at`
- release reason metadata

Behavior:

- active pins are never selected for eviction
- cleanup plan selection only includes unpinned entries
- pin release is explicit and auditable

## Eviction Model

Cleanup uses a deterministic planning model.

Selection properties:

- sort order: oldest `last_accessed_at`, then lowest access count, then stable key order
- stale artifacts are selected first by policy age
- quota pressure adds additional least-recently-used selection
- candidate count is bounded by `evictionBatchSize` or explicit request limit

Run modes:

- `dry-run`: plan generation only
- `execute`: apply selected unpinned candidate deletions in metadata layer

## Mirror Model

Mirrors are stored with deterministic priority and health fields.

Mirror fields include:

- `mirror_id`
- `base_url`
- `enabled`
- `priority`
- authentication reference fields
- health timestamps and failure counters

Security handling:

- secret values are never returned raw in API responses
- sensitive headers are redacted (`Authorization`, `Proxy-Authorization`, `X-Api-Key`, `Api-Key`)

## Integrity Audit Model

Audit runs are tracked with durable status and finding counts.

Audit summary fields:

- run id and lifecycle timestamps
- scanned entry count
- finding totals (`corrupt`, `missing`, `stale`)
- degraded flag

Current implementation records findings and state without destructive automatic remediation.

## Cache Health Model

Operator health summary includes:

- total usage and entry counts
- pinned versus evictable usage
- mirror enabled/degraded counts
- latest audit status
- degraded flags for over-quota, mirror degradation, and audit degradation

## Administration APIs

Admin-only routes:

- `GET /api/admin/plugins/marketplace/cache-health`
- `GET /api/admin/plugins/marketplace/policy`
- `PUT /api/admin/plugins/marketplace/policy`
- `POST /api/admin/plugins/marketplace/cleanup`
- `GET /api/admin/plugins/marketplace/mirrors`
- `POST /api/admin/plugins/marketplace/mirrors`
- `PATCH /api/admin/plugins/marketplace/mirrors`
- `GET /api/admin/plugins/marketplace/audit`
- `POST /api/admin/plugins/marketplace/audit`

All routes enforce server-side admin verification.

## Offline Expectations

Offline operation remains trust-preserving:

- cache usage does not bypass signature/trust verification in install flow
- missing valid cached artifact in offline mode remains a blocker
- over-quota state is surfaced as degraded, not silently ignored

## Residual Risks

Current phase intentionally leaves two follow-ups:

- filesystem artifact deletion is not yet coupled to metadata cleanup execution
- mirror fetch fallback routing is not yet wired into artifact acquisition network sequence

These are planned next increments under Issue #73.
