# ADR-0001: Structured roadmap and work intake

- Status: accepted
- Date: 2026-07-03
- Related issues: #12, #13, #16

## Context

DevHolm development has grown through ongoing discussion and feature work. Valuable ideas, deferred scope, architectural requirements, and completion criteria can become difficult to recover when they remain only in chat history or are added opportunistically to active implementation.

The repository needs a durable planning model that preserves ideas without scattering planning files across the project or allowing active pull requests to grow without explicit scope control.

## Decision

DevHolm will use a layered planning model:

1. `docs/roadmap/` stores durable product direction, governance, workstream sequencing, architectural decisions, and archived milestone summaries.
2. GitHub issue #12 is the long-lived top-level roadmap tracker.
3. GitHub issue #16 is the idea inbox for concepts that are worth preserving but are not yet implementation-ready.
4. Mature work receives a dedicated issue with purpose, dependencies, scope boundaries, and acceptance proof before substantial implementation begins.
5. Pull requests link the issue they advance and distinguish implemented behavior from deferred work.
6. Major architectural decisions are recorded under `docs/roadmap/decisions/`.
7. Roadmap-specific files will not be scattered across the repository root.

## Consequences

### Positive

- Ideas and obligations survive beyond individual conversations.
- Scope expansion becomes visible and reviewable.
- Implementation order and dependencies remain explicit.
- Completed work can be distinguished from skeleton or deferred functionality.
- Repository planning material stays organized in one location.

### Costs

- Roadmap issues and documents require maintenance.
- Some ideas will remain in intake until they are sufficiently defined.
- Pull requests may need follow-on issues instead of absorbing every discovered requirement.

## Alternatives considered

### Keep planning only in chat history

Rejected because important requirements and completion boundaries are difficult to recover reliably.

### Put a single roadmap file in the repository root

Rejected because the roadmap will grow and needs structured governance, workstreams, decisions, and archives without polluting the root directory.

### Create an issue for every idea immediately

Rejected because it creates issue noise before ideas have enough definition to become actionable.

## Follow-up

- Maintain #12 as the top-level tracker.
- Use #16 for future idea intake.
- Complete #13 by reviewing and merging the structured roadmap documentation.
- Apply the process to active and future DevHolm workstreams.
