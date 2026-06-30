# Docs Information Architecture

This document defines a wiki-style structure for DevHolm documentation that can later be rendered directly inside a DevHolm site.

## Objectives

- Make onboarding linear for first-time users.
- Keep advanced operational content discoverable but separate.
- Support future docs-as-content ingestion without rewriting all markdown.

## Audience Lanes

### Lane A: New Users

Needs:

- Local setup
- First customization
- First deploy

Primary docs:

- [Documentation Wiki](./wiki.md)
- [First-Time Setup Path](./first-time-setup-path.md)
- [Getting Started](./getting-started.md)

### Lane B: Contributors And Framework Integrators

Needs:

- architecture and seam boundaries
- extension strategy
- upgrade policy

Primary docs:

- [Architecture](./architecture.md)
- [Developer Guide](./developer-guide.md)
- [Extensions](./extensions.md)
- [Downstream Boundaries](./downstream-boundaries.md)
- [Upgrading](./upgrading.md)

### Lane C: Operators

Needs:

- CI/CD setup
- secrets contract
- deployment and troubleshooting

Primary docs:

- [CI and Secrets Runbook](./ci-secrets-runbook.md)
- [GitHub Secrets Setup](../GITHUB_SECRETS.md)
- [Deployment Guide](../DEPLOYMENT.md)

## Proposed Metadata Schema For Future Ingestion

When ready to render docs in-app, add metadata headers per markdown page:

- title
- summary
- audience: new-user | contributor | operator
- stage: local-dev | customization | ci-cd | production | upgrade
- order: numeric ordering within lane
- tags: list of related topics

This enables generated sidebars, stage-based filtering, and related-article linking.

## Navigation Model

Top-level navigation groups:

1. Start Here
2. Build
3. Operate
4. Upgrade
5. Reference

Suggested source of truth:

- [Documentation Wiki](./wiki.md) acts as canonical entry and grouping index.

## Migration Plan To In-App Docs

Phase 1:

- Keep current markdown files in docs directory.
- Add metadata headers incrementally.

Phase 2:

- Add docs loader in a user extension or framework docs module.
- Parse markdown plus metadata into a docs registry.

Phase 3:

- Render docs pages in a dedicated docs route.
- Build sidebar from audience and stage metadata.

Phase 4:

- Add full-text search and cross-link cards.
- Add version switcher for docs tied to framework release tags.

## Maintenance Rules

- Every new doc must be linked from [Documentation Wiki](./wiki.md).
- Operator-impacting changes must update [CI and Secrets Runbook](./ci-secrets-runbook.md).
- Onboarding-impacting changes must update [First-Time Setup Path](./first-time-setup-path.md).
