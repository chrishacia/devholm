# Framework Packaging Roadmap (Optional Hardening Track)

This roadmap describes how to evolve DevHolm into a package-driven model for stronger upstream/downstream isolation across many sites.

## Why

File-level upstream merges work today, but package boundaries reduce drift and conflict risk as the number of downstream sites grows.

## Target state

- `@devholm/core` package
  - framework engine (`src/core/**`)
  - extension runtime contracts
- site repository
  - `src/user/**`
  - `devholm.config.ts`
  - site app shell and deployment configuration

## Phased plan

### Phase 1: Contract extraction

- Move shared type contracts into a package-ready folder.
- Publish internal package builds from DevHolm CI.
- Keep existing file layout while introducing package imports behind aliases.

### Phase 2: Runtime split

- Move extension runtime resolution and framework utilities into package entrypoints.
- Keep downstream compatibility shims for one major version.

### Phase 3: Site template migration

- Update template to consume `@devholm/core`.
- Convert direct framework file edits to package upgrades.

### Phase 4: Long-term support

- Add semver release channels.
- Publish migration guides and codemods for breaking changes.

## Risks

- Build tooling complexity during transition.
- Temporary duplicate code paths while compatibility shims exist.

## Exit criteria

- New downstream sites require zero edits under framework-owned paths.
- Upgrades become package version bumps plus migration steps.
