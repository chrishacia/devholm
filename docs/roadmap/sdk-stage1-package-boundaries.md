# SDK Stage 1 Package Boundaries

Status: Implemented in Stage 1
Date: 2026-07-03
Related issues: #6, #28
Related ADR: `docs/roadmap/decisions/0002-sdk-boundaries-and-access-policy.md`

## Supported imports

Stage 1 establishes the real workspace package at `packages/sdk` with package name `@devholm/sdk`.

Supported public imports:

- `@devholm/sdk`
- `@devholm/sdk/server`
- `@devholm/sdk/middleware`
- `@devholm/sdk/react`
- `@devholm/sdk/testing`

No other subpaths are supported. Unexported internal files are intentionally blocked by the package export map.

## Stage 1 limitations

Stage 1 does not implement authorization runtime behavior changes. It introduces only package boundaries, neutral contract primitives, and runtime-target boundary fixtures.

Out of scope for Stage 1:

- policy evaluation engines
- API/page/action/admin migration
- middleware routing behavior rewrites
- React visibility runtime logic
- compatibility adapters
- release-channel or publication policy from issue #7

## Boundary rules enforced in Stage 1

- Root `devholm` may depend on `@devholm/sdk`.
- `@devholm/sdk` must not import root internals from `src/core/**`, `src/app/**`, or `src/user/**`.
- Alias bypasses via `@core/*`, `@user/*`, and `@/*` are prohibited for SDK source files.
- Deep-relative SDK imports into root internals are prohibited for SDK source files.
- Middleware and React entrypoints are validated with browser-target bundle fixtures to prevent accidental server-only transitive imports.

## Runtime contract notes

- `@devholm/sdk` root export is runtime-neutral and data-only.
- `@devholm/sdk/server` is marked server-only.
- `@devholm/sdk/middleware` and `@devholm/sdk/react` are kept free from server-only transitive imports through fixture checks.
