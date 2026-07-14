import { valid, validRange } from 'semver';
import {
  CANONICAL_DEPENDENCY_POLICY_VERSION,
  CANONICAL_PLUGIN_SCHEMA_VERSION,
  type CanonicalEnvironment,
  type CanonicalPluginConfigEntry,
  type CanonicalPluginContractsDocument,
  type CanonicalPluginStateAxes,
  type CanonicalPluginSummaryState,
} from '@core/types/plugin-canonical-contracts';

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type CanonicalContractValidationCode =
  | 'unsupported-schema-version'
  | 'duplicate-plugin-id'
  | 'invalid-plugin-id'
  | 'invalid-version'
  | 'missing-source'
  | 'local-override-id-mismatch'
  | 'local-override-not-allowed'
  | 'mutable-production-ref'
  | 'missing-digest'
  | 'missing-signature'
  | 'invalid-compatibility-range'
  | 'unsupported-dependency-mode'
  | 'lifecycle-scripts-allowed-production'
  | 'unsupported-frontend-contribution'
  | 'secret-config-exposed-public'
  | 'invalid-state-combination'
  | 'bundled-default-without-build-inclusion'
  | 'enabled-by-default-without-build-inclusion'
  | 'contradictory-source-policy';

export type CanonicalContractValidationError = {
  code: CanonicalContractValidationCode;
  pluginId: string;
  message: string;
};

function pushError(
  errors: CanonicalContractValidationError[],
  code: CanonicalContractValidationCode,
  pluginId: string,
  message: string
): void {
  errors.push({ code, pluginId, message });
}

function validateSource(
  entry: CanonicalPluginConfigEntry,
  env: CanonicalEnvironment,
  errors: CanonicalContractValidationError[]
): void {
  if (!entry.source) {
    pushError(errors, 'missing-source', entry.pluginId, 'source descriptor is required');
    return;
  }

  if (entry.source.sourceKind === 'local-development-checkout') {
    if (!entry.localSourceOverride?.enabled) {
      pushError(
        errors,
        'local-override-not-allowed',
        entry.pluginId,
        'local development checkout source requires localSourceOverride.enabled=true'
      );
    }

    if (entry.localSourceOverride && entry.localSourceOverride.targetPluginId !== entry.pluginId) {
      pushError(
        errors,
        'local-override-id-mismatch',
        entry.pluginId,
        'localSourceOverride.targetPluginId must match pluginId'
      );
    }

    if (env !== 'development') {
      pushError(
        errors,
        'local-override-not-allowed',
        entry.pluginId,
        `local source override is only allowed in development, got ${env}`
      );
    }
  }

  if (entry.source.sourceKind !== 'local-development-checkout') {
    const source = entry.source;
    if (!source.immutableRef || !source.artifactUrlOrLocator) {
      pushError(
        errors,
        'missing-source',
        entry.pluginId,
        'artifact sources require immutableRef and artifact locator'
      );
    }

    if (env === 'production' || env === 'ci') {
      if (!SHA256_PATTERN.test(source.sha256)) {
        pushError(
          errors,
          'missing-digest',
          entry.pluginId,
          'production/ci requires valid sha256 digest'
        );
      }

      if (entry.sourcePolicy.requireSignatureInProduction && !source.signature) {
        pushError(
          errors,
          'missing-signature',
          entry.pluginId,
          'production policy requires signature metadata'
        );
      }
    }
  }
}

function validateEntry(
  entry: CanonicalPluginConfigEntry,
  env: CanonicalEnvironment,
  errors: CanonicalContractValidationError[]
): void {
  if (entry.schemaVersion !== CANONICAL_PLUGIN_SCHEMA_VERSION) {
    pushError(
      errors,
      'unsupported-schema-version',
      entry.pluginId,
      `schemaVersion ${String(entry.schemaVersion)} is not supported`
    );
  }

  if (!PLUGIN_ID_PATTERN.test(entry.pluginId)) {
    pushError(
      errors,
      'invalid-plugin-id',
      entry.pluginId,
      'pluginId must be kebab-case and <= 120 chars'
    );
  }

  if (!valid(entry.desiredVersion) && !validRange(entry.desiredVersion)) {
    pushError(
      errors,
      'invalid-version',
      entry.pluginId,
      'desiredVersion must be valid semver or semver range'
    );
  }

  if (!validRange(entry.compatibility.devholmVersion)) {
    pushError(
      errors,
      'invalid-compatibility-range',
      entry.pluginId,
      'compatibility.devholmVersion must be a valid semver range'
    );
  }

  if (entry.bundledDefault && !entry.includedInBuild) {
    pushError(
      errors,
      'bundled-default-without-build-inclusion',
      entry.pluginId,
      'bundledDefault requires includedInBuild=true'
    );
  }

  if (entry.enabledByDefault && !entry.includedInBuild) {
    pushError(
      errors,
      'enabled-by-default-without-build-inclusion',
      entry.pluginId,
      'enabledByDefault requires includedInBuild=true'
    );
  }

  if (entry.dependencyPolicy.policyVersion !== CANONICAL_DEPENDENCY_POLICY_VERSION) {
    pushError(
      errors,
      'unsupported-dependency-mode',
      entry.pluginId,
      'dependency policy version is unsupported'
    );
  }

  if (entry.dependencyPolicy.mode === 'unsupported-runtime-install' && env === 'production') {
    pushError(
      errors,
      'unsupported-dependency-mode',
      entry.pluginId,
      'unsupported-runtime-install dependency mode is not allowed in production'
    );
  }

  if (!entry.dependencyPolicy.forbidLifecycleScriptsInProduction && env === 'production') {
    pushError(
      errors,
      'lifecycle-scripts-allowed-production',
      entry.pluginId,
      'production dependency policy must forbid lifecycle scripts'
    );
  }

  if (
    entry.frontend?.contributionMode === 'unsupported-framework-injection' &&
    (env === 'production' || env === 'ci')
  ) {
    pushError(
      errors,
      'unsupported-frontend-contribution',
      entry.pluginId,
      'unsupported deep framework injection is not allowed in production or CI'
    );
  }

  for (const declaration of entry.configDeclarations ?? []) {
    if (declaration.visibility === 'public' && declaration.redaction !== 'none') {
      pushError(
        errors,
        'secret-config-exposed-public',
        entry.pluginId,
        `public config ${declaration.key} cannot require redaction`
      );
    }

    if (declaration.visibility === 'secret' && declaration.redaction === 'none') {
      pushError(
        errors,
        'secret-config-exposed-public',
        entry.pluginId,
        `secret config ${declaration.key} requires redaction`
      );
    }
  }

  if (!entry.sourcePolicy.requireImmutableArtifactInProduction && env === 'production') {
    pushError(
      errors,
      'contradictory-source-policy',
      entry.pluginId,
      'production policy must require immutable artifacts'
    );
  }

  if (!entry.sourcePolicy.prohibitMutableRefsInProduction && env === 'production') {
    pushError(
      errors,
      'mutable-production-ref',
      entry.pluginId,
      'production policy must prohibit mutable refs'
    );
  }

  validateSource(entry, env, errors);
}

export function validateCanonicalPluginContracts(
  document: CanonicalPluginContractsDocument,
  environment: CanonicalEnvironment
): CanonicalContractValidationError[] {
  const errors: CanonicalContractValidationError[] = [];

  if (document.schemaVersion !== CANONICAL_PLUGIN_SCHEMA_VERSION) {
    pushError(
      errors,
      'unsupported-schema-version',
      'document',
      `document schemaVersion ${String(document.schemaVersion)} is not supported`
    );
  }

  const seen = new Set<string>();
  for (const entry of document.plugins) {
    if (seen.has(entry.pluginId)) {
      pushError(
        errors,
        'duplicate-plugin-id',
        entry.pluginId,
        `duplicate pluginId ${entry.pluginId}`
      );
    }
    seen.add(entry.pluginId);
    validateEntry(entry, environment, errors);
  }

  return errors;
}

export function summarizeCanonicalPluginState(
  axes: CanonicalPluginStateAxes
): CanonicalPluginSummaryState {
  if (
    axes.resolution === 'failed' ||
    axes.build === 'failed' ||
    axes.deployment === 'failed' ||
    axes.runtime === 'failed'
  ) {
    return 'failed';
  }

  if (axes.resolution === 'blocked' || axes.trust === 'blocked') {
    return 'blocked';
  }

  if (axes.resolution === 'incompatible') {
    return 'incompatible';
  }

  if (axes.recovery === 'recovery-required') {
    return 'recovery-required';
  }

  if (axes.recovery === 'rolling-back') {
    return 'rolling-back';
  }

  if (axes.recovery === 'rollback-available') {
    return 'rollback-available';
  }

  if (axes.runtime === 'degraded' || axes.health === 'degraded') {
    return 'degraded';
  }

  if (axes.runtime === 'active') {
    return 'active';
  }

  if (axes.runtime === 'activating') {
    return 'activating';
  }

  if (axes.desired === 'disabled' || axes.runtime === 'disabled') {
    return 'disabled';
  }

  if (axes.deployment === 'deployed') {
    return 'deployed';
  }

  if (axes.deployment === 'deploying') {
    return 'deploying';
  }

  if (axes.deployment === 'deploy-pending') {
    return 'deploy-pending';
  }

  if (axes.build === 'build-included') {
    return 'build-included';
  }

  if (axes.build === 'building') {
    return 'building';
  }

  if (axes.build === 'build-pending') {
    return 'build-pending';
  }

  if (axes.resolution === 'awaiting-approval' || axes.trust === 'awaiting-approval') {
    return 'awaiting-approval';
  }

  if (axes.resolution === 'verified' && axes.trust === 'verified') {
    return 'verified';
  }

  if (axes.resolution === 'resolved') {
    return 'resolved';
  }

  if (axes.resolution === 'resolving') {
    return 'resolving';
  }

  if (axes.desired === 'update-available') {
    return 'update-available';
  }

  if (axes.desired === 'updating') {
    return 'updating';
  }

  return 'configured';
}

export function validateCanonicalStateAxes(axes: CanonicalPluginStateAxes): string[] {
  const errors: string[] = [];

  if (axes.runtime === 'active' && axes.deployment !== 'deployed') {
    errors.push('runtime=active requires deployment=deployed');
  }

  if (
    axes.build === 'build-included' &&
    axes.resolution !== 'verified' &&
    axes.resolution !== 'resolved'
  ) {
    errors.push('build=build-included requires resolution to be resolved or verified');
  }

  if (axes.recovery === 'rolling-back' && axes.desired !== 'rolling-back') {
    errors.push('recovery=rolling-back requires desired=rolling-back');
  }

  if (axes.health === 'healthy' && axes.runtime === 'degraded') {
    errors.push('health=healthy is incompatible with runtime=degraded');
  }

  if (axes.resolution === 'blocked' && axes.runtime === 'active') {
    errors.push('resolution=blocked cannot be runtime=active');
  }

  return errors;
}
