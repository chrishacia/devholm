# Theme and Template Extensibility Initiative

Status: planned; implementation has not started.

Parent tracking issue: #141.

## Sequence boundary

The plugin-convergence sequence in Issues #92 through #104 is complete. This initiative begins from
the converged package, trust, build, lifecycle, upgrade, rollback, and deployment architecture
proven by merge SHA `2523ecc29b4695a7d60965d2f4ef8131663abe7f`.

SevenSparxx is not an implementation target in this initiative. Its radical gamer/streamer design is
a future real-world acceptance test. No SevenSparxx route, page, component, package, or deployment
belongs in these issues.

## Outcome

A DevHolm site must be able to remain close to stock with a small branding package or become
structurally unrecognizable without editing `src/core` or framework-owned `src/app` routes. The
framework must retain authorization, accessibility, metadata, hydration, error containment, package
trust, and deployment ownership in both cases.

The initiative is incomplete if a future SevenSparxx implementation cannot provide its command-center
homepage, custom responsive shell, stream sections, Dev Lab, clips, schedule, and merch presentation
through public contracts and site-owned packages.

## Three separate contracts

| Contract | Owns | Does not own |
| --- | --- | --- |
| Theme | design tokens, MUI theme factories, typography, fonts, assets, effects, component variants, global styling, color modes, responsive preferences, and motion preferences | page structure, business behavior, persistence, permissions, or integrations |
| Template | application shells, headers, footers, navigation presentation, page layouts, reusable sections, page composition, responsive ordering, and presentation-state variants | authorization, server data authority, persistence, or direct database mutation |
| Plugin / extension | functionality, APIs, settings, persistence, permissions, integrations, events, jobs, and public data providers/adapters | arbitrary access to framework internals or ownership of core route protection |

One package may declare companion relationships, but the contracts remain explicit. Calling a
functional plugin a theme, or embedding unrestricted business logic in a template, is invalid.

## Non-negotiable architecture decisions

### One canonical frontend package system

Themes and templates containing frontend code are build-time DevHolm packages. They must reuse the
canonical plugin package-resolution pipeline for:

- exact version selection and pinning
- immutable artifact resolution
- digest and signature verification
- publisher trust and revocation
- DevHolm compatibility checks
- dependency and peer-dependency policy
- deterministic build-input preparation
- desired-configuration planning
- update and rollback planning
- audit events and administrative status
- Docker image binding and deployment proof

Package-kind-specific manifests and entry points are allowed. A second resolver, installer, cache,
lockfile, trust store, update engine, or rollback engine is not.

Installing or changing a theme/template with React, MUI, or Next.js-integrated code changes desired
build configuration and requires a rebuild/redeployment. Runtime activation is valid only for code
already included in the deployed image. The CLI and administration UI must say this plainly.

### Public presentation SDK

Create a stable public surface, preferably `@devholm/sdk/ui`, with versioned exports for:

- theme tokens and theme-factory inputs
- shell, layout, section, slot, and page-composition contracts
- route/view identifiers and override registrations
- loading, empty, error, and not-found presentation contracts
- responsive ordering, visibility rules, and reduced-motion helpers
- framework-owned accessibility landmark wrappers
- safe metadata and navigation presentation inputs
- plugin section-data adapter contracts
- diagnostics and resolved-customization projections

Themes/templates may consume React, MUI, and explicitly documented peer dependencies. They may not
import `src/core`, private package paths, framework-owned route modules, database modules, server-only
authorization internals, or another package's unpublished internals.

Enforce the boundary with package exports, TypeScript paths, ESLint restricted imports, and
architecture tests that bundle representative external packages rather than relying only on aliases.

### Framework-owned invariants

Customization must not replace or bypass:

- authoritative server authorization and route protection
- authentication/session mechanics
- accessibility landmarks, focus order, skip links, and keyboard behavior
- metadata assembly and canonical URL behavior
- framework error boundaries and safe failure containment
- color-mode hydration safety
- reduced-motion preference enforcement
- plugin capability/permission checks
- public plugin data adapters
- core database ownership

Stock DevHolm must work with no custom theme/template package configured.

## Versioned theme manifest

The package contract must define a versioned manifest with at least:

```ts
interface DevHolmThemeManifestV1 {
  schemaVersion: 1;
  kind: 'theme';
  id: string;
  name: string;
  publisher: string;
  version: string;
  devholm: { supportedRange: string };
  entrypoints: {
    theme: string;
    presentation?: string;
    sections?: string;
  };
  assets: Array<{ id: string; path: string; integrity?: string }>;
  modes: Array<'light' | 'dark' | 'system'>;
  capabilities: string[];
  peerDependencies: Record<string, string>;
  companionPlugins?: Array<{ id: string; range: string; optional: boolean }>;
}
```

Template manifests must share the canonical package identity, compatibility, dependency, integrity,
and lifecycle envelope while declaring template-specific entry points/capabilities. Unknown schema
versions, incompatible DevHolm ranges, invalid entry points, undeclared capabilities, or unsatisfied
required peers must fail visibly before build/activation.

## DevHolmConfig presentation contract

`DevHolmConfig` must safely register:

- theme tokens and MUI theme factories
- fonts and static assets
- shell variants
- header, footer, logo, navigation, and account-control presentation overrides
- named layouts
- reusable section components
- page compositions
- typed slot contributions
- loading, empty, error, and not-found variants
- responsive and motion preferences
- optional plugin-provided section adapters

Registrations must use stable public identifiers and typed props. Config validation must reject
duplicates, unknown core identifiers, invalid package references, impossible responsive ordering,
unsafe server/client crossings, and unresolvable data-adapter dependencies.

## Typed sections and page composition

Whole-view ejection is an escape hatch, not the primary workflow. Pages should resolve as composed
layouts and sections.

A page composition must be able to choose:

- shell and layout IDs
- ordered stable section IDs
- typed section props
- visibility rules
- mobile/tablet/desktop ordering
- public data-source adapter references
- loading, empty, and error variants
- site-owned React sections registered through the public SDK

The homepage and other advertised framework views must support this without changes to `src/core` or
framework-owned `src/app` routes.

Plugin sections never receive direct database handles or internal service imports. A plugin exposes a
public, permission-checked data adapter; the section consumes its typed public result.

## Layered shell resolution

The application shell must resolve in layers so a site may replace:

1. only the logo
2. only the header
3. only the footer
4. navigation/account-control presentation
5. the complete public shell presentation

Framework wrappers continue to own authentication, authorization, accessibility landmarks, metadata,
error boundaries, and hydration behavior. A full public-shell replacement is therefore a presentation
replacement inside a framework-owned safety envelope, not replacement of the envelope itself.

## Complete route, view, and slot reachability

Create one authoritative catalog of advertised view names, shell layers, layouts, sections, slots, and
state variants. Every framework route must use the same registered-resolution boundary. Contract tests
must prove each public identifier is reachable from at least one real route or explicitly reject it as
unsupported. Dead registrations and routes that bypass the resolver are release blockers.

## Remove hard-coded root visual policy

Move these concerns behind supported config/theme contracts:

- font registration and font variables
- viewport and browser theme colors
- global theme CSS
- pre-hydration color-mode initialization
- default container widths
- breakpoint and responsive behavior
- branding/logo assets
- default motion/effects policy

Root files may apply resolved values and framework invariants, but must not remain the site-specific
source of truth.

## Ejection compatibility

Ejection remains available for explicit exceptional cases. An ejected view must record:

- stable view identifier
- originating DevHolm version and source digest
- ejection timestamp/tool version
- original source snapshot or immutable reference
- current upstream version
- compatibility status

CLI diagnostics must report ejected, stale, removed, and incompatible views and provide a readable
upstream diff. Ejection must never become an undocumented copy/paste path.

## CLI surface

Provide commands equivalent to:

```text
devholm theme create
devholm theme validate
devholm theme test
devholm theme prepare
devholm presentation scaffold layout
devholm presentation scaffold section
devholm presentation inspect
devholm presentation eject
devholm presentation ejection-status
devholm presentation diff-upstream
```

Commands must support manifest/compatibility validation, supported-version test matrices, resolved
customization diagnostics, package preparation before the next build, and machine-readable output for
CI/admin tooling.

## Administration behavior

The administration UI must distinguish:

- configured package
- included in current build
- pending build
- pending deployment
- active
- incompatible
- blocked by trust/dependency policy
- update available
- rollback available
- ejected/stale presentation

Actions that cannot succeed in the current deployment must not be offered as immediate runtime
installs. The UI must explain rebuild, deployment, activation, compatibility, and rollback effects.

## Automated validation matrix

Coverage must include:

- stock fallback with no custom theme/template
- site-owned token/theme overrides
- shell-layer and component overrides
- complete public-shell replacement inside the invariant envelope
- typed section composition and responsive ordering
- site-owned React sections
- plugin-provided section adapters and permission failures
- every advertised route/view/slot registration point
- light, dark, and system modes
- mobile, tablet, and desktop breakpoints
- accessibility landmarks, keyboard behavior, focus order, and reduced motion
- SSR, streaming where applicable, hydration, and pre-hydration color mode
- visual regression for stock and both reference packages
- compatible upgrade from an older theme
- incompatible theme and unsatisfied peer failure
- build with no custom theme installed
- deterministic build preparation and exact package/version reporting
- ejected-view status and upstream diff behavior

## Reference packages

### Minimal reference theme

Prove that common branding remains easy: palette, typography, logo/assets, component variants, light
and dark modes, and modest header/footer styling without custom route or core edits.

### Radical structural reference theme

Prove that DevHolm can look nothing like stock: custom responsive public shell, structurally different
homepage composition, reordered sections, custom layouts, effects, and state variants without editing
`src/core` or framework-owned routes.

This package is generic reference material. It must not be SevenSparxx-branded or implement the
SevenSparxx site.

## SevenSparxx future acceptance test

The final audit must include a feasibility mapping—not an implementation—showing how these future
SevenSparxx surfaces resolve through public contracts:

| Future surface | Required public mechanism |
| --- | --- |
| Command-center homepage | page composition + shell + named layout + typed sections |
| Custom responsive shell | layered/full public-shell presentation inside invariant envelope |
| Stream sections | typed sections + plugin/public data adapters + state variants |
| Dev Lab | named layouts + site-owned sections + permission-checked data adapters |
| Clips | reusable sections + media/plugin adapters + responsive ordering |
| Schedule | plugin-provided section adapter + loading/empty/error variants |
| Merch | site-owned/plugin section + external integration adapter; no direct core mutation |

Any surface requiring a `src/core` or framework-route edit fails the initiative.

## Dependency-ordered delivery plan

| Order | Issue | Work package | Depends on |
| --- | --- | --- | --- |
| 1 | #142 | Themes A: architecture contracts and canonical frontend package manifest | none |
| 2 | #143 | Themes B: public UI SDK and import-boundary enforcement | #142 |
| 3 | #144 | Themes C: DevHolmConfig presentation registration and typed resolver | #142, #143 |
| 4 | #145 | Themes D: typed section registry, page composition, and data adapters | #143, #144 |
| 5 | #146 | Themes E: layered shell and complete route/view/slot reachability | #143, #144 |
| 6 | #147 | Themes F: theme runtime, assets, modes, responsive policy, SSR, and hydration | #142, #143, #144 |
| 7 | #148 | Themes G: canonical build-time package planning, admin activation, upgrade, and rollback | #142, #144, #147 |
| 8 | #149 | Themes H: CLI scaffolding, validation, inspection, and ejection tooling | #144–#148 |
| 9 | #150 | Themes I: contract, accessibility, breakpoint, hydration, and visual test matrix | #145–#148 |
| 10 | #151 | Themes J1: minimal branding reference package | #147–#150 |
| 11 | #152 | Themes J2: radical structural reference package | #145–#151 |
| 12 | #153 | Themes K: final security, compatibility, release, and SevenSparxx feasibility audit | #151, #152 |

Each child issue must be implemented in its own bounded PR. Discovered work outside a child's written
scope becomes a linked follow-up or a deliberate issue update; it must not be silently absorbed.

## Explicit non-goals

- no SevenSparxx implementation
- no arbitrary React/Next.js source injection into a running production image
- no replacement package manager or parallel trust/update system
- no theme-controlled authorization or database access
- no requirement that sites eject framework views for ordinary customization
- no removal of stock DevHolm presentation
- no unrelated UI redesign of stock DevHolm
