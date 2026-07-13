# Roadmap Governance

This document defines how DevHolm ideas become scoped, implemented, validated, released, and archived.

## Planning layers

### 1. Idea intake

Uncommitted ideas belong in the long-lived idea inbox, [issue #16](https://github.com/chrishacia/devholm/issues/16).

An idea comment should include:

- The user or developer problem
- The desired outcome
- Why it matters to DevHolm
- Known constraints or risks

Ideas are not implementation authorization. A mature idea is promoted into a dedicated issue before substantial development begins.

### 2. Roadmap workstream issue

A roadmap issue should define:

- Purpose
- Required capabilities
- Dependencies
- Explicit out-of-scope items
- Acceptance proof

Large workstreams may gain child implementation issues. Do not silently expand an active pull request when follow-on work deserves its own issue.

### 3. Implementation pull request

Every substantive pull request should link to the issue it advances.

The pull request must distinguish:

- What is implemented
- What is intentionally deferred
- What validation was actually executed
- What remains before product completion

A green pull request is not automatically the same as a finished product milestone.

### 4. Completion and archive

Close a roadmap issue only when its acceptance criteria are satisfied.

When a major milestone lands:

- Update the parent roadmap checklist
- Record the merged PR and release SHA
- Move deferred scope into dedicated issues
- Add a concise milestone summary under `docs/roadmap/archive/` when historical context would otherwise be lost
- Update normal release notes or `CHANGELOG.md` where appropriate

## Status meanings

Use issue state as the primary status signal.

- **Open:** accepted roadmap work that is not complete
- **Closed — completed:** acceptance criteria are satisfied
- **Closed — duplicate:** consolidated into another issue
- **Closed — not planned:** intentionally rejected or deferred indefinitely

When more detail is useful, state it in the issue body or a current status comment:

- Candidate
- Planned
- Active
- Blocked
- In review

Avoid a large set of overlapping status labels.

## Sequencing and dependencies

Dependencies should be explicit in issue bodies. Starting dependent work early is acceptable only when it will not force unstable contracts or duplicate implementation.

Current intended sequence is maintained in [`WORKSTREAMS.md`](./WORKSTREAMS.md) and the parent roadmap issue [#12](https://github.com/chrishacia/devholm/issues/12).

## Scope control

When discussion exposes a new requirement:

1. Decide whether it belongs to the current acceptance criteria.
2. If it is required for correctness or safety, update the active issue and PR scope explicitly.
3. If it is a broader follow-on capability, open or update a separate roadmap issue.
4. Link the issues so the dependency remains visible.

Do not bury broader architectural requirements inside one feature PR merely because the need was discovered during that feature.

## Release gates

A major roadmap item is not complete until the applicable gates pass:

- Acceptance criteria are satisfied
- Relevant automated tests run without hidden skips
- Upgrade and migration behavior is tested
- Authorization and security are reviewed where applicable
- Downstream framework boundaries remain intact
- Documentation is updated
- Deferred work is explicitly tracked
- Release notes distinguish shipped functionality from skeleton or planned functionality

## Completion doctrine

Mergeable is not complete. Merged is not complete. Issue closure is not complete.

Work is complete only when the exact merged commit has reached a terminal successful state for every applicable verification path.

Required expectations:

- Separate reporting for implementation state, local validation state, PR validation state, merge state, and post-merge health state.
- All applicable unit, integration, PostgreSQL-backed, and E2E suites must run and pass.
- Relevant suites may not silently skip because of missing environment, missing services, or broad conditional logic.
- Typecheck, lint, production build, migrations, seeds, and security checks must pass where applicable.
- Pending, unknown, flaky, rerun-only, skipped, or baseline-failing relevant checks block completion until they are resolved or explicitly accepted.
- Rerun-only success is evidence of a flake that must be tracked, not silent proof of health.
- Local validation should use the repository parity entrypoint `pnpm validate:ci` unless a narrower approved command is explicitly more appropriate.
- Post-merge workflows for the merged commit must also reach terminal success before a final completion report is issued.
- If branch-protection or ruleset evidence is unavailable, state that gap explicitly rather than inferring protection from workflow YAML alone.
- Baseline failures and accepted exceptions must be tracked with evidence, an owner, and an exit condition.

Identity safety:

- Personal project GitHub identity for DevHolm work is `chrishacia`.
- The work identity `ten-cmh` must not be used for this repository.

## Labels and milestones

Keep taxonomy minimal.

Recommended workstream labels, when created, should be limited to durable categories such as:

- `area:framework`
- `area:sdk`
- `area:plugins`
- `area:first-party-plugin`
- `area:docs`
- `area:operations`

Use priority labels only when work is genuinely ordered. Use milestones for meaningful release or architectural checkpoints, not every small task.

## Architectural decisions

Use an architectural decision record when a choice changes a public contract, upgrade model, security boundary, plugin/package model, or deployment assumption.

Decision records belong under `docs/roadmap/decisions/` and should contain:

- Status
- Context
- Decision
- Consequences
- Alternatives considered
- Related issues and pull requests

Small implementation details do not need an ADR.

## Repository organization

All roadmap-specific documentation belongs under `docs/roadmap/`:

```text
docs/roadmap/
├── README.md
├── GOVERNANCE.md
├── WORKSTREAMS.md
├── decisions/
└── archive/
```

Do not scatter roadmap notes across the repository root or unrelated source directories.
