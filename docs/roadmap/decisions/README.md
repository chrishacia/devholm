# Architectural Decision Records

This directory contains lightweight architectural decision records for choices that materially affect DevHolm’s public contracts, upgrade model, security boundaries, plugin/package model, or deployment assumptions.

## File naming

Use sequential filenames:

```text
0001-short-decision-name.md
0002-next-decision.md
```

## Current records

- `0001-structured-roadmap-and-work-intake.md` (accepted)
- `0002-sdk-boundaries-and-access-policy.md` (proposed)

## Required sections

```markdown
# ADR-0000: Decision title

- Status: proposed | accepted | superseded | rejected
- Date: YYYY-MM-DD
- Related issues: #...
- Related PRs: #...

## Context

## Decision

## Consequences

## Alternatives considered

## Follow-up
```

## When an ADR is appropriate

Create an ADR when a decision changes or establishes:

- A public SDK or extension contract
- Framework-versus-site ownership boundaries
- Authentication or authorization policy
- Plugin lifecycle, package, version, or marketplace assumptions
- Upgrade or migration guarantees
- Security or capability boundaries
- Deployment architecture

Small implementation details and routine refactors do not need ADRs.

## Maintenance

- Accepted ADRs remain immutable except for typo or link corrections.
- A changed decision should create a new ADR and mark the previous record superseded.
- Issues and PRs should link the relevant ADR.
