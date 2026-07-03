# Active Roadmap Workstreams

This document summarizes the active DevHolm workstreams and their intended order. GitHub issues remain the actionable source of truth for acceptance criteria and status.

## 1. Plugin lifecycle foundation and URL Shortener skeleton

Issue: [#5](https://github.com/chrishacia/devholm/issues/5)  
Implementation: [PR #4](https://github.com/chrishacia/devholm/pull/4)

### Goal

Complete the generic plugin lifecycle, production packaging, migration ownership, and URL Shortener skeleton.

### Completion boundary

This workstream is complete when the lifecycle foundation is merged with full CI evidence. It does not make the URL Shortener a complete functional product.

### Status

Completed on 2026-07-03.

- Issue: [#5](https://github.com/chrishacia/devholm/issues/5)
- Implementation: [PR #4](https://github.com/chrishacia/devholm/pull/4)
- Squash SHA: `1ff17aad4ffafc12ac1ec3eea0a7f11c871c9c37`
- Lifecycle foundation completed
- URL Shortener remains a skeleton
- Functional URL Shortener work remains tracked by [#8](https://github.com/chrishacia/devholm/issues/8)

---

## 2. Public developer SDK and authorization contracts

Issue: [#6](https://github.com/chrishacia/devholm/issues/6)

### Status

Next active foundation workstream.

### Goal

Give downstream developers stable, upgrade-safe ways to build custom pages, APIs, components, services, database-backed actions, and external integrations without patching framework-owned code.

### Core requirements

- Stable server, client, and testing SDK entrypoints
- Page, API, public-route, admin-page, navigation, and component registration helpers
- Shared access policies for everyone, anonymous-only, authenticated users, roles, permissions, ownership, and custom authorization
- Client visibility helpers backed by authoritative server enforcement
- CLI scaffolding and examples
- Contract and upgrade tests

### Dependencies

Build on the merged lifecycle foundation. This work should settle public contracts before first-party plugins rely heavily on one-off internal imports.

---

## 3. Extension events, background jobs, and scheduled tasks

Issue: [#11](https://github.com/chrishacia/devholm/issues/11)

### Goal

Provide supported event and asynchronous-work seams for site extensions and plugins.

### Core requirements

- Versioned event contracts
- Background job registration
- Scheduled task registration
- Retry, idempotency, failure, and observability conventions
- Plugin enablement and lifecycle integration
- Testing utilities

### Dependencies

Depends on the public SDK direction and plugin lifecycle ownership model.

---

## 4. Plugin packaging, version pinning, and safe updates

Issue: [#7](https://github.com/chrishacia/devholm/issues/7)

### Goal

Extend lifecycle-aware plugins into independently versioned packages that can be pinned, resolved, upgraded, verified, and rolled back safely.

### Core requirements

- Plugin semantic versions and DevHolm compatibility ranges
- Exact resolved-version lockfile
- Exact pins, ranges, channels, and manual-update policies
- Integrity and provenance verification
- Update preflight and capability-change warnings
- Staged activation and failed-upgrade recovery
- Package-source abstraction for bundled, local, Git, private-registry, and future marketplace sources

### Marketplace boundary

This workstream prepares the package model for a future marketplace. It does not build marketplace accounts, payments, ratings, discovery, or licensing.

---

## 5. URL Shortener functional MVP

Issue: [#8](https://github.com/chrishacia/devholm/issues/8)

### Goal

Turn the URL Shortener skeleton into the first complete reference plugin built entirely through supported DevHolm contracts.

### MVP requirements

- Link creation, editing, disabling, and deletion
- Safe short-code generation and validation
- Real redirect resolution
- Protected administration UI and API
- Privacy-safe click recording
- Basic totals and daily analytics
- Lifecycle, version, upgrade, and E2E coverage

### Dependencies

The functional plugin should use the SDK and authorization model from #6. It should adopt the package/version contracts from #7 before it is considered distribution-ready.

---

## 6. Calendar conversion

Issue: [#9](https://github.com/chrishacia/devholm/issues/9)

### Goal

Move Calendar from direct core/embed registration into a lifecycle-managed, versioned plugin while preserving existing data and behavior.

### Dependencies

Requires stable lifecycle, SDK, authorization, and package/version contracts.

---

## 7. Gallery conversion

Issue: [#10](https://github.com/chrishacia/devholm/issues/10)

### Goal

Move Gallery from direct core/embed registration into a lifecycle-managed, versioned plugin while preserving existing records and media references.

### Dependencies

Requires stable lifecycle, SDK, authorization, and package/version contracts.

---

## Long-term directions

These are valid strategic directions but should remain in the idea inbox until promoted into scoped workstreams:

- DevHolm plugin marketplace
- Publisher identity and signed releases
- Paid licensing and entitlement management
- Marketplace security scanning and revocation
- Advanced plugin capability sandboxing
- Additional first-party plugins

Add new ideas to [issue #16](https://github.com/chrishacia/devholm/issues/16) rather than starting implementation from an untracked discussion.
