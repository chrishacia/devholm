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
- Convert Resume, Uses, and Projects into lifecycle-managed marketplace plugins that remain configured as stock DevHolm capabilities
- Admin navigation ordering UI for core and plugin-contributed administration links
- ChatGPT and compatible agent integration plugin built on a reviewed, hardened agentic API foundation
- Marketplace e-commerce plugin with native payment-provider integrations and optional hosted checkout delegation
- Global DevHolm webring plugin with category-based discovery and optional future browser-extension exploration
- Multi-list mailing-list plugin with provider connectors such as Mailchimp and SendGrid
- Twilio integration plugin placeholder for future messaging, telephony, notification, and verification use cases
- Shared image editing and derivative-management capability available anywhere DevHolm accepts image media
- Pre-1.0 release/versioning realignment with a durable update-order mechanism independent of visible product SemVer

### Stock marketplace plugin boundary

Resume, Uses, and Projects should ultimately follow the same first-party marketplace model intended for Calendar, Gallery, and the URL Shortener: distributed through the marketplace and managed through canonical lifecycle contracts, while still shipping as part of the default DevHolm experience. Their conversions must preserve existing routes, content, records, settings, SEO behavior, and navigation, and must support disable, removal, reinstall, update, pinning, rollback, and recovery without reverting to one-off bundled implementation paths.

### Admin navigation ordering boundary

Provide an authorized admin experience for arranging core and plugin-contributed admin navigation links. Ordering must use stable identifiers, persist through a supported configuration or settings contract, handle new/removed/disabled entries deterministically, and include reset-to-default and recovery behavior. It must not depend on direct source edits.

### ChatGPT and agent integration boundary

The future agent integration should begin as a least-privilege, read-only plugin and progressively add controlled write capabilities through explicit scopes, approvals, audit logging, rate limits, and revocable credentials. It must reuse supported SDK, lifecycle, authorization, and capability-sandbox contracts rather than exposing framework internals, unrestricted database access, filesystem access, or shell execution.

Before promotion into implementation work, revisit and sanity-check the existing agentic-style API endpoint and define the supported machine-readable capability contract. This direction must not interrupt the active plugin-convergence sequence tracked by #92 through #104.

### E-commerce plugin boundary

The future e-commerce plugin should support a DevHolm-native catalog and order-management experience while allowing multiple checkout and payment strategies. Initial provider candidates include Stripe and similar payment APIs, with an optional Shopify-hosted checkout path for users who want Shopify to remain the commerce authority. The design must separate products, inventory, orders, taxes, shipping, payment state, refunds, webhooks, provider credentials, and provider-specific adapters so one provider does not become a permanent framework dependency. PCI-sensitive card data must remain with compliant providers rather than passing through DevHolm directly.

### Global webring boundary

The webring concept should allow DevHolm site owners to opt in, register their site, select one or more categories, and expose related sites through a configurable widget. A centralized directory may be operated by `devholm.com`, but the protocol, governance, privacy, moderation, abuse controls, availability expectations, category model, ranking/discovery behavior, and export/portability requirements need dedicated workshopping before implementation. Widget concepts may include a simple branded webring control or a richer related-sites list. A future StumbleUpon-style browser extension may be explored separately and must not be required for the plugin itself.

### Mailing-list plugin boundary

The mailing-list plugin should manage multiple independent lists, list metadata, signup forms, consent records, subscriber state, unsubscribe and suppression behavior, import/export, segmentation, and campaign/provider synchronization. Mailchimp and SendGrid should be evaluated as initial connectors, but provider abstraction must remain explicit so additional services can be added. DevHolm must not become an unsafe bulk-mail relay; deliverability, consent, anti-spam controls, webhook verification, bounce/complaint handling, credential isolation, and audit history are required parts of the eventual design.

### Twilio integration placeholder

Preserve a future Twilio plugin direction for workshopping after higher-priority roadmap items are complete. Potential capabilities may include SMS notifications, transactional messaging, phone verification, voice workflows, or other communications features. No implementation scope should be assumed until supported use cases, consent requirements, regional rules, pricing controls, abuse prevention, audit behavior, and the boundary between shared communication services and plugin-owned features are defined.

### Shared image editing boundary

Image editing should be implemented as a reusable platform capability available to core features and plugins anywhere image media is uploaded or managed. For supported image uploads, DevHolm should offer an editing modal with crop, resize, rotation/orientation correction, and a small set of safe generic adjustments such as brightness, contrast, exposure, saturation, and similar non-destructive filters. Existing media should be editable through the same workflow.

The media model should support retaining the original, creating one or more edited derivatives, choosing whether the original remains stored, preserving metadata and ownership links, and recording derivative provenance. The design must address aspect-ratio presets, output format and quality, file-size limits, EXIF orientation and metadata policy, accessibility text, storage accounting, cleanup, rollback, permissions, audit history, and plugin access through supported media contracts. Editing must not silently overwrite an original unless the user explicitly chooses that behavior.

### Pre-1.0 release and versioning boundary

Before DevHolm is presented as a stable `1.x` product, define and adopt an explicit release philosophy that reflects actual product maturity rather than incrementing the major version for ordinary development milestones. The policy must classify patch, minor, major, prerelease, release-candidate, and stable releases; define what qualifies as a breaking change; and establish concrete readiness criteria for `1.0.0`, including feature completeness, robustness, stability, migration confidence, documentation, accessibility, security, operational recovery, and substantially improved UI/UX.

The current `3.x` line may be realigned to an intentional pre-1.0 line, or replaced by another carefully evaluated scheme such as calendar-based or Apple-style marketing versions, but the chosen system must remain understandable to developers, users, deployment automation, package tooling, and marketplace compatibility checks. Existing Git tags, published artifacts, database migrations, schema sequences, and deployment history must remain immutable historical records rather than being rewritten or reused.

Because normal SemVer comparison treats `0.x` and `1.x` as older than `3.x`, update ordering must use a separate monotonic release identity such as a release epoch plus release sequence. The migration should include a final bridge release on the old line, a signed release manifest, explicit supersedence metadata, staged upgrade support for installations that missed the bridge, rollback and compatibility rules, and immutable image-digest binding. Framework, plugin, schema/migration, API-contract, and marketplace version domains must remain distinct so a product-version realignment does not reset or corrupt unrelated compatibility histories.

This work should be promoted into a dedicated implementation issue after the active #92–#104 plugin-convergence sequence, but before public marketplace distribution, broad automated-update adoption, or any declaration of DevHolm `1.0.0` readiness.

The detailed intake records are preserved in [issue #16](https://github.com/chrishacia/devholm/issues/16).

Add new ideas to [issue #16](https://github.com/chrishacia/devholm/issues/16) rather than starting implementation from an untracked discussion.