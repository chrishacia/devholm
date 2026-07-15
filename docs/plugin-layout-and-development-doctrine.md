# Plugin Layout and Development Doctrine

## 1) Official local Git workflow

- Primary working directory: /Users/sevensparxx/dev/devholm.com.
- Default feature workflow: create and use normal Git branches inside that directory.
- Separate Git worktrees are exceptional and must be explicitly requested.
- If temporary worktrees are used, place them intentionally under /Users/sevensparxx/dev and remove them after merge or abandonment.
- Do not create sibling Devholm worktrees by default.

## 2) Plugin audience and mode categories

- Plugin users:
  - Install/enable plugins and configure settings.
  - Do not need plugin source checkout.
- Plugin developers:
  - Build, test, and iterate on plugin source locally.
  - Need local plugin development paths and generation commands.
- Devholm maintainers (first-party bundled plugins):
  - Maintain framework-shipped plugins and lifecycle contracts.
  - Own compatibility, migrations, and release quality.
- Third-party/private/paywalled plugin authors:
  - Publish plugins via package, git, tarball, or marketplace channels.
  - Must support integrity and version compatibility contracts.

## 3) First-party bundled plugin source location

Future-proof target layout:

- plugins/bundled/url-shortener
- plugins/bundled/calendar
- plugins/bundled/gallery

Current transitional location remains under src/user/extensions/plugins/\*.
When migration is scheduled, move first-party plugin source into a dedicated plugins/bundled tree and keep runtime wiring thin in src.

## 4) Local plugin development location

Recommended local dev options:

- In-repo development sandbox:
  - plugins/dev/<plugin-id>
- External local paths configured in plugin config:
  - absolute/relative local filesystem references for active development

Local plugin dev mode must support watch/build/test loops without requiring publish.

## 5) Installed runtime plugin location in production

- Runtime-installed plugin payloads must not be editable source under src.
- Runtime assets should live in a runtime/cache/data location (for example under /var/lib/devholm/plugins or equivalent deployment-managed data path).
- Production runtime should consume packaged assets, not mutable source trees.

## 6) Normal user plugin install/use model

Recommended root config contract (final format to be chosen once implemented):

- devholm.plugins.config.ts (preferred for typed config)
- devholm.plugins.json
- devholm.plugins.yaml

The config should define enabled plugins, source descriptors, version pins, and update policy.

## 7) Local plugin developer workflow

Developers need:

- Local plugin source path registration (without publishing)
- watch/build/test commands for plugin package
- deterministic registry generation for runtime artifacts
- lifecycle install/enable/disable simulation in local environments

Baseline commands:

- pnpm plugins:generate
- pnpm plugins:check

## 8) Third-party/private/paywalled plugin model (forward-looking)

Support model should include:

- source channels:
  - package names and versions
  - git refs
  - tarballs
  - marketplace registry
  - private repositories
- security and integrity:
  - checksums for package and migration assets
  - optional publisher signatures
  - lockfile/pinning semantics
- entitlement and policy:
  - license/entitlement checks
  - update policy (manual/stable/beta)
  - safe staged updates and rollback strategy

## 9) What generated/plugins is

generated/plugins is derived runtime packaging output generated from plugin source manifests and migration declarations.

It contains:

- generated/plugins/registry.json
- generated/plugins/<plugin-id>/migrations/\*

It is not plugin source-of-truth.
Source-of-truth remains plugin manifests and migration source files in plugin source directories.

## 10) Hard rules

- Plugin source must not live under generated.
- generated/plugins must not be hand-edited.
- generated/plugins is treated as derived output and is gitignored.
- Regenerate with pnpm plugins:generate, validate with pnpm plugins:check.
- CI must generate plugin assets before lint/test/build steps that depend on registry/runtime migration assets.
- Production builds use pnpm plugins:prepare-production to generate the registry and production build-preparation manifest before next build.
