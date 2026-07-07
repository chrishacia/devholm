# Plugin Package Versioning, Pinning, and Safe Updates

> **Issue**: [#7](https://github.com/chrishacia/devholm/issues/7)  
> **Status**: Implementation in progress
> **SDK Version**: 3.11.0+

## Overview

Issue #7 implements complete plugin package versioning and update management. This turns the plugin lifecycle into a production-grade package manager with safe upgrades, rollback capability, and flexible pin policies.

## Key Capabilities

### 1. Semantic Plugin Versioning

Plugin versions follow semantic versioning and are **independent** of DevHolm framework versions:

```typescript
interface DevholmPluginManifest {
  version: string; // e.g., "1.2.3" - plugin's own version
  devholmVersion?: string; // e.g., ">=3.10.0" - required DevHolm version
}
```

### 2. Explicit DevHolm Compatibility

Each plugin declares its DevHolm version requirements using semver ranges:

```typescript
// Plugin requires DevHolm 3.10+
{
  devholmVersion: '>=3.10.0';
}

// Plugin works with DevHolm 2.x and 3.x
{
  devholmVersion: '^2.0.0 || ^3.0.0';
}

// Plugin works with anything (no restriction)
{
  devholmVersion: undefined;
}
```

### 3. Plugin Dependency Ranges

Plugins can declare dependencies on other plugins using semver ranges:

```typescript
dependencies: {
  plugins: {
    "url-shortener": "^1.0.0",
    "analytics": ">=2.0.0 <4.0.0"
  }
}
```

### 4. Exact Installed-Version Lockfile

All installed plugin versions are locked in a database lockfile:

```typescript
interface PluginLockfile {
  lockfileVersion: 1;
  devholmVersion: "3.11.0";
  packages: {
    "url-shortener": {
      version: "1.2.3",
      devholmVersion: "3.11.0",
      source: { type: "bundled" },
      integrity: { packageChecksum: "sha256...", ... },
      lockedAt: "2026-07-06T19:00:00Z"
    }
  }
}
```

This ensures reproducible plugin state across deployments.

### 5. User-Selectable Update Policies

Users can choose between three update policies per plugin:

```typescript
type PluginUpdatePolicy = 'manual' | 'stable' | 'beta';

// Manual updates only - user controls every version
{ policy: 'manual', exactVersion: '1.5.0' }

// Stable channel within compatible range
{ policy: 'stable', compatibleRange: '^1.0.0', channel: 'stable' }

// Beta releases allowed
{ policy: 'beta', compatibleRange: '^2.0.0-beta', channel: 'beta' }
```

### 6. Update Preflight Analysis

Before updating, get a detailed preflight showing all changes:

```typescript
interface PluginUpdatePreflight {
  isCompatibleWithCurrentDevholm: boolean;
  isCompatibleWithDependencies: boolean;
  migrationsToApply: PluginMigrationMetadata[];
  migrationsToRevert: PluginMigrationMetadata[];
  capabilityChanges?: { added: string[]; removed: string[] };
  dependencyChanges?: { added; removed; upgraded };
  irreversibleChanges: string[]; // Warning for risky migrations
  warnings: string[];
}
```

### 7. Safe Staged Activation with Rollback

Updates use staged activation to ensure failures don't corrupt plugin state:

```typescript
// Stage 1: Pre-validation (lock previous version)
const checkpoint = await engine.startActivation(pluginId, targetVersion, checksum);

// Stage 2: Pre-migration (capture previous state)
engine.advanceToPreMigration(pluginId);

// Stage 3: Execute migrations (with staged checkpoints)
await runMigrations();

// Stage 4: Post-migration (verify)
engine.advanceToPostMigration(pluginId);

// Stage 5: Finalize (commit new lock)
await engine.finalizeActivation(...);

// On error: automatic rollback to previous version
```

### 8. Migration Reversibility Metadata

Migrations are classified for safety:

```typescript
type MigrationReversibility = 'reversible' | 'irreversible' | 'partial';

{
  id: "plugin:002_drop_column",
  reversibility: "irreversible",
  irreversibleWarning: "Dropping columns cannot be reversed",
  requiredDownMigration: "plugin:001_restore"
}
```

Users see clear warnings before applying irreversible changes.

### 9. Package Source Abstraction

Plugins can come from multiple sources:

```typescript
type PluginPackageSource =
  | { type: 'bundled'; bundleId?: string }
  | { type: 'local'; path: string }
  | { type: 'git'; repo: string; ref: string; path?: string }
  | { type: 'registry'; registryUrl: string; packageName: string }
  | { type: 'marketplace'; publisherId: string; packageId: string };
```

This enables:

- **Bundled**: Plugins shipped with DevHolm
- **Local**: Development plugins from filesystem
- **Git**: Direct from Git repositories
- **Registry**: Private npm-like registries
- **Marketplace**: (future) Signed plugin marketplace

### 10. Integrity and Provenance

Package integrity is tracked cryptographically:

```typescript
interface PluginPackageIntegrity {
  packageChecksum: string; // SHA256 of entire package
  manifestChecksum: string; // SHA256 of manifest for change detection
  migrationChecksums: Record<string, string>; // Each migration verified
  publisherSignature?: string; // For marketplace packages
}
```

### 11. CLI and Admin Controls

Full control via CLI commands:

```bash
# Install with automatic compatible updates
devholm plugin install url-shortener

# Pin to exact version (manual updates only)
devholm plugin pin url-shortener@1.5.0

# Inspect current state
devholm plugin inspect url-shortener

# Preview update
devholm plugin update --dry-run url-shortener

# Perform update
devholm plugin update url-shortener

# Rollback to previous version
devholm plugin rollback url-shortener

# List all plugins and pins
devholm plugin list
```

Admin UI provides visual controls:

- See all installed plugins with versions
- Set update policy (manual/stable/beta)
- Preview compatibility before updating
- Trigger/schedule updates
- View update history

## Architecture

### Database Schema

**plugin_lockfile** - Exact versions and integrity:

```sql
- plugin_id (unique)
- version (semver)
- devholm_version
- package_source (JSON)
- package_checksum, manifest_checksum, migration_checksums
- locked_at, locked_by (audit trail)
```

**plugin_update_pins** - User policies:

```sql
- plugin_id (unique)
- exact_version (manual pin)
- compatible_range (compatible policy)
- channel (stable/beta/alpha filter)
- policy (manual/stable/beta)
```

**plugin_update_history** - Update log:

```sql
- plugin_id, from_version, to_version
- status (success/failed/rolled_back)
- applied_at, applied_by
- rollback_available_until (7-day window)
- last_checkpoint (for staged activation)
```

**plugin_packages** - Available versions (for caching/discovery):

```sql
- plugin_id, version (unique together)
- devholm_compat_range
- release_channel (stable/beta/alpha)
- package_source, checksums
- publisher_id, publisher_signature (marketplace)
- yanked_at (for revocation)
```

### Type System

Public SDK types (in `@devholm/sdk/types/plugins.ts`):

```typescript
// Package sources
export type PluginPackageSource = { type, ... }

// Integrity
export interface PluginPackageIntegrity { packageChecksum, ... }

// Update policies
export type PluginUpdatePolicy = 'manual' | 'stable' | 'beta'
export interface PluginUpdatePin { exactVersion?, compatibleRange?, ... }

// Lockfile
export interface PluginLockfile { lockfileVersion, packages, ... }

// Update planning
export interface PluginUpdatePreflight { isCompatible..., warnings, ... }

// Safe activation
export type PluginActivationStage
export interface PluginActivationCheckpoint { stage, version, ... }

// History
export interface PluginUpdateRecord { status, rollbackAvailableUntil, ... }
```

### Core Services

**plugin-versioning.server.ts** - Compatibility checking:

```typescript
export function isCompatibleWithDevholm(...): { compatible, reason? }
export function isDependencySatisfied(...): { satisfied, reason? }
export function checkDependencyCompatibility(...): { compatible, warnings }
export function buildUpdatePreflight(...): PluginUpdatePreflight
export function findCompatibleVersions(...)
export function findLatestCompatibleVersion(...)
```

**plugin-safe-activation.server.ts** - Safe updates:

```typescript
export class PluginSafeActivationEngine {
  startActivation(...)
  advanceToPreMigration()
  advanceToPostMigration()
  finalizeActivation(...)
  rollbackActivation(...) // automatic on error
  getCheckpoint(...)
}

export async function performSafePluginUpdate(...)
```

**plugin-versioning.ts (DB layer)** - Data access:

```typescript
export async function getPluginLock(pluginId)
export async function getAllPluginLocks() // entire lockfile
export async function lockPluginVersion(...)
export async function getPluginUpdatePin(pluginId)
export async function setPluginUpdatePin(pluginId, pin)
export async function recordPluginUpdate(...)
export async function getPluginUpdateHistory(pluginId)
export async function getLastSuccessfulUpdate(pluginId)
```

## Acceptance Proof

Six deterministic test scenarios validate issue #7:

1. **Pin exact version**: Lock plugin-a to 1.5.0 with manual policy
2. **Compatible updates**: Allow plugin-b updates within ^2.0.0
3. **Preview update plan**: Show preflight with all changes (migrations, dependencies, capabilities, warnings)
4. **Reject incompatible**: Prevent update when DevHolm or dependency incompatible
5. **Safe upgrade**: Complete staged update with lockfile/state rollback safety
6. **Rollback on failure**: Preserve previous version, restore on update failure

All scenarios are covered by deterministic tests in:

- `src/test/plugin-versioning.test.ts` (unit tests)
- `src/test/plugin-versioning-lockfile.test.ts` (database tests)
- `src/test/plugin-versioning-acceptance.test.ts` (end-to-end proof)

## Future Marketplace Compatibility

The design leaves room for:

- **Signed artifacts**: `publisherSignature` field supports verification
- **Capability disclosures**: Manifest extensions for security features
- **Security scanning**: Package metadata stores scan results
- **Release revocation**: `yanked_at` timestamp for package withdrawal
- **Licensing/purchases**: Extensible `packageMetadata` field for license data
- **Ratings/discovery**: Plugin registry service (separate from package manager)

The package manager itself does not implement these - they are add-ons to the metadata model.

## Limitations (Intentional)

### Out of Scope for #7

- Marketplace service or plugin discovery (future issue)
- Security scanning integration (future issue)
- Automatic beta→stable promotion workflows (future issue)
- Capacity planning or dependency resolution optimizer
- GraphQL admin API (use existing endpoints)
- npm-like public registry (organizations self-host or use private registries)

### By Design

- No auto-uninstall of unused dependencies (keep all data)
- No transactional DB rollback for failed migrations (use migration down-steps)
- No zero-downtime staging (admin schedules updates)
- No A/B testing infrastructure

## Migration Path

### Existing Installations

Existing bundled plugins are automatically migrated:

1. First update with #7 code runs migration
2. Plugin lockfile is initialized from current `devholm_plugins` state
3. All bundled plugins locked to their current versions
4. Update pins default to `{ policy: 'manual' }` (no automatic updates)
5. Admins can change policies after initial lock

### Plugin Authors

To opt into new versioning:

1. Add `devholmVersion` to manifest
2. Add `releaseChannel` if publishing beta/alpha
3. Annotate migrations with `reversibility` metadata
4. Declare `packageSource` if non-bundled
5. Test compatibility against multiple DevHolm versions

## Testing Strategy

### Unit Tests

- Semver range compatibility checking
- Dependency resolution logic
- Migration reversibility classification
- Version selection algorithms (latest-compatible, within-range)

### Database Tests

- Lockfile creation and updates
- Pin management (exact, range, channel, policy)
- Update history recording
- Rollback availability calculation

### Integration Tests

- Staged activation workflow
- Safe rollback on migration failure
- Preflight analysis accuracy
- Multi-plugin update orchestration

### Acceptance Proof

- All 6 scenarios above as end-to-end tests
- Deterministic and repeatable
- Validates CLI/admin paths

## Configuration

Via `site_settings` table:

```
"plugin:*:update-check-interval" = "86400" (seconds)
"plugin:*:rollback-window" = "604800"   (7 days)
"plugin:*:auto-update-enabled" = "false"
```

Per-plugin overrides:

```
"plugin:url-shortener:pin-policy" = "stable"
"plugin:url-shortener:exact-pin" = "1.5.0"
"plugin:url-shortener:channel" = "stable"
```

## CLI Examples

```bash
# Install and use defaults
$ devholm plugin install url-shortener
Installing url-shortener@1.0.0...
Checking DevHolm compatibility: >=3.10.0 ✓
Running migrations: 3 migrations
Pinning to manual updates
url-shortener@1.0.0 installed ✓

# Preview update without applying
$ devholm plugin update --dry-run url-shortener
Available: 1.0.1, 1.1.0, 1.2.0, 2.0.0
Recommended: 1.2.0 (stable, compatible)

Update plan: 1.0.0 → 1.2.0
  DevHolm:      >=3.10.0 ✓ (3.11.0 ok)
  Dependencies: all satisfied ✓
  Migrations:   2 migrations (reversible)

Apply? (y/n) n

# Set compatible update policy
$ devholm plugin pin url-shortener --policy stable --range "^1.0.0"
url-shortener: policy updated to stable with range ^1.0.0

# List plugins
$ devholm plugin list
ID              Version  Policy    Range      Status
url-shortener   1.0.0    manual    -          installed
analytics       2.1.0    stable    ^2.0.0     installed
email           1.5.0    stable    ^1.5.0     update available (1.6.0)
```

## Next Steps (Issue #8)

Once #7 is merged, [issue #8](https://github.com/chrishacia/devholm/issues/8) builds the first production plugin on top:

- **URL Shortener Plugin**: Uses versioning, dependency system, safe updates
- Demonstrates multi-version compatibility
- Shows migration reversibility in action
- Tests pin policies and rollback
