# DevHolm Agent Guidance

## Identity safety

- Use the `chrishacia` GitHub identity for this repository.
- Do not use the `ten-cmh` identity for DevHolm work.

## Completion doctrine

- Mergeable is not complete.
- Merged is not complete.
- Issue closure is not proof of health.
- Do not call work done until the exact merged commit has terminal success for all applicable validation and workflow paths.

## Validation expectations

- Run `pnpm validate:ci` for repository-parity validation unless a narrower scoped command is explicitly more appropriate.
- Treat applicable skipped, pending, flaky, rerun-only, or unknown checks as blockers until they are tracked, resolved, or explicitly accepted by Chris.
- Do not hide relevant failures behind post-merge-only execution.
- When a test depends on global mutable state, isolate it intentionally and document the reason.

## Reporting expectations

- Separate implementation state, local validation state, PR validation state, merge state, and post-merge health state.
- State clearly when branch-protection or ruleset evidence is unavailable rather than inferring it from workflow YAML alone.
- Baseline failures and accepted exceptions must carry evidence, an owner, and an exit condition.
