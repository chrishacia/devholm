# Marketplace Admin UX (Issue #70)

## Scope

This document describes the admin marketplace experience for discovery, inspection, install orchestration visibility, enable/disable controls, and blocked update/rollback handling.

Implemented scope includes:

- marketplace catalog discovery in admin
- plugin detail inspection
- install confirmation UX and durable operation-status visibility
- install/update/rollback/enable/disable actionability summaries with stable reason codes
- signature and publisher trust surfaced separately
- lifecycle and migration summaries visible before action
- recovery-required and blocked state presentation

## Non-goals in this phase

The following are explicitly out of scope for Issue #70:

- public marketplace storefront
- commerce, ratings, or reviews
- self-service publisher enrollment
- automatic plugin updates
- full runtime update/rollback mutation APIs
- mirror administration and distribution controls from Issue #73

## Authoritative data sources

Admin UX reads authoritative server-backed data from:

- `GET /api/admin/plugins/marketplace/catalog`
- `GET /api/admin/plugins/marketplace/:pluginId`
- `GET /api/admin/plugins/marketplace/install/status?pluginId=...`
- existing lifecycle controls in `PATCH /api/admin/plugins`
- install execution in `POST /api/admin/plugins/marketplace/install`

Catalog/detail responses include:

- installed state and lifecycle state
- installed and available versions
- publisher identity and class
- signature verification status
- publisher trust-policy decision summary
- capability, lifecycle, and migration summaries
- durable operation snapshot
- update history summary for rollback eligibility context
- per-action allowed/blocked state with reason/remediation

## State model

The admin UI state model is defined in `src/app/admin/plugins/marketplace-state.ts`.

Supported states:

- available
- unavailable
- incompatible
- untrusted
- revoked
- misconfigured
- not_installed
- install_pending
- installing
- installed_disabled
- enable_pending
- enabled
- disable_pending
- update_available
- update_pending
- updating
- rollback_available
- rollback_pending
- rolling_back
- blocked
- failed
- recovery_required
- cancelled
- degraded
- unsupported

Unknown states fail closed to `unsupported` and disable mutation actions.

## Security and trust separation

The UI intentionally does not collapse security into one badge.

Admins see separate signals for:

- artifact signature verification
- publisher trust-policy decision
- capability and lifecycle/migration requirements
- actionability blockers and remediation

Disabled controls are not treated as security controls. Server routes continue to enforce authorization and operation constraints.

## Install flow behavior

Install confirmation dialog includes:

- plugin identity and version
- signature/trust summary
- migration and data-risk summary
- explicit confirmation action
- duplicate-submit prevention while operation is pending

Install does not imply enablement. Installed and enabled states are represented separately.

## Update and rollback UX behavior

Update and rollback are shown with explicit actionability status and reason/remediation.

Current runtime contracts for direct update/rollback mutation are not yet exposed in this phase; the UI surfaces this clearly as blocked/unsupported where applicable.

## Recovery behavior

When an operation is failed/interrupted/corrupted, the UI presents recovery-required state and guidance.

Recovery guidance is operator-facing and avoids exposing sensitive internals.

## Accessibility behavior

The admin surface includes:

- semantic headings and labels
- keyboard-accessible dialogs and buttons
- explicit warning/blocked text (not color-only)
- loading skeletons
- empty and error states

## Operational limitations

- Runtime marketplace install support is controlled by feature gating.
- Signature and trust outcomes depend on configured trusted keys and trust-policy data.
- Rollback candidates shown from update history do not imply rollback mutation availability.
