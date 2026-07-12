import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import type { ExtensionAccessPolicyMetadata } from '@core/types/extensions.server';
import type { DevholmPluginManifest } from '@core/types/plugins';
import { bundledPlugins } from '@user/extensions/plugins/registry';

export type PluginSandboxSurface =
  | 'admin-page'
  | 'api-route'
  | 'public-route'
  | 'metadata'
  | 'structured-data'
  | 'sitemap'
  | 'robots'
  | 'embed';

type PluginSandboxRiskLevel = 'low' | 'medium' | 'high';

interface PluginSandboxCapabilityDefinition {
  id: string;
  description: string;
  riskLevel: PluginSandboxRiskLevel;
  requiresExplicitApproval: boolean;
  allowedSurfaces: readonly PluginSandboxSurface[];
  allowedRuntimeOwners: readonly NonNullable<ExtensionAccessPolicyMetadata['runtimeOwner']>[];
  allowedOperations: readonly string[];
  deniedOperations: readonly string[];
}

const CAPABILITY_REGISTRY = new Map<string, PluginSandboxCapabilityDefinition>([
  [
    'calendar.admin-management',
    {
      id: 'calendar.admin-management',
      description: 'Calendar admin APIs and admin page bridge operations.',
      riskLevel: 'high',
      requiresExplicitApproval: false,
      allowedSurfaces: ['admin-page', 'api-route'],
      allowedRuntimeOwners: ['core-filesystem'],
      allowedOperations: ['admin-session-check', 'db-read', 'db-write'],
      deniedOperations: [
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'calendar.public-viewing',
    {
      id: 'calendar.public-viewing',
      description: 'Calendar public view metadata and route ownership declarations.',
      riskLevel: 'medium',
      requiresExplicitApproval: false,
      allowedSurfaces: ['public-route', 'api-route'],
      allowedRuntimeOwners: ['core-filesystem'],
      allowedOperations: ['db-read'],
      deniedOperations: [
        'db-write',
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'calendar.public-booking',
    {
      id: 'calendar.public-booking',
      description: 'Calendar booking operations gated by explicit policy approval.',
      riskLevel: 'high',
      requiresExplicitApproval: true,
      allowedSurfaces: ['api-route'],
      allowedRuntimeOwners: ['core-filesystem'],
      allowedOperations: ['db-read', 'db-write'],
      deniedOperations: [
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'gallery.admin-management',
    {
      id: 'gallery.admin-management',
      description: 'Gallery admin APIs and admin page bridge operations.',
      riskLevel: 'high',
      requiresExplicitApproval: false,
      allowedSurfaces: ['admin-page', 'api-route'],
      allowedRuntimeOwners: ['core-filesystem'],
      allowedOperations: ['admin-session-check', 'db-read', 'db-write'],
      deniedOperations: [
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'gallery.public-viewing',
    {
      id: 'gallery.public-viewing',
      description: 'Gallery public route and API read surfaces.',
      riskLevel: 'medium',
      requiresExplicitApproval: false,
      allowedSurfaces: ['public-route', 'api-route'],
      allowedRuntimeOwners: ['core-filesystem'],
      allowedOperations: ['db-read'],
      deniedOperations: [
        'db-write',
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'url-shortener.admin-management',
    {
      id: 'url-shortener.admin-management',
      description: 'URL Shortener admin APIs and admin pages.',
      riskLevel: 'high',
      requiresExplicitApproval: false,
      allowedSurfaces: ['admin-page', 'api-route'],
      allowedRuntimeOwners: ['plugin-extension'],
      allowedOperations: ['admin-session-check', 'db-read', 'db-write'],
      deniedOperations: [
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
  [
    'url-shortener.public-routing',
    {
      id: 'url-shortener.public-routing',
      description: 'URL Shortener public route claim and redirect rewrite behavior.',
      riskLevel: 'medium',
      requiresExplicitApproval: false,
      allowedSurfaces: ['public-route'],
      allowedRuntimeOwners: ['plugin-extension'],
      allowedOperations: ['route-match', 'route-rewrite'],
      deniedOperations: [
        'filesystem-arbitrary',
        'process-spawn',
        'shell-exec',
        'environment-secret-read',
        'network-arbitrary',
      ],
    },
  ],
]);

export interface PluginSandboxAccessDecision {
  allowed: boolean;
  executionId: string;
  pluginId?: string;
  surface: PluginSandboxSurface;
  reason: string;
  capability?: string;
  riskLevel?: PluginSandboxRiskLevel;
  permissionKeys: string[];
  deniedPermissionKeys: string[];
  requiresExplicitApproval: boolean;
}

export interface EvaluatePluginSandboxAccessInput {
  pluginId?: string;
  surface: PluginSandboxSurface;
  accessPolicy?: ExtensionAccessPolicyMetadata;
  resourceId: string;
  loadCapabilityApproval?: (params: { pluginId: string; capability: string }) => Promise<boolean>;
}

async function loadCapabilityApprovalFromDb(
  pluginId: string,
  capability: string
): Promise<boolean> {
  const db = getDb();
  const key = `plugin:${pluginId}:capability:${capability}:approved`;
  const record = await db('site_settings').where('key', key).select('value').first();
  return record?.value === 'true';
}

function findManifestByPluginId(pluginId: string): DevholmPluginManifest | null {
  const plugin = bundledPlugins.find((entry) => entry.manifest.id === pluginId);
  return plugin?.manifest ?? null;
}

export function getPluginSandboxCapabilityRegistry(): readonly PluginSandboxCapabilityDefinition[] {
  return [...CAPABILITY_REGISTRY.values()];
}

export async function evaluatePluginSandboxAccess(
  input: EvaluatePluginSandboxAccessInput
): Promise<PluginSandboxAccessDecision> {
  const executionId = randomUUID();

  if (!input.pluginId) {
    return {
      allowed: true,
      executionId,
      surface: input.surface,
      reason: 'core runtime surface without plugin ownership',
      permissionKeys: [],
      deniedPermissionKeys: [],
      requiresExplicitApproval: false,
    };
  }

  const pluginId = input.pluginId;
  const policy = input.accessPolicy;
  if (!policy) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `sandbox policy missing for plugin runtime surface ${input.resourceId}`,
      permissionKeys: [],
      deniedPermissionKeys: [],
      requiresExplicitApproval: false,
    };
  }

  const capability = policy.capability?.trim();
  if (!capability) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: 'sandbox policy must declare capability id',
      permissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      deniedPermissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      requiresExplicitApproval: false,
    };
  }

  const capabilityDefinition = CAPABILITY_REGISTRY.get(capability);
  if (!capabilityDefinition) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `unknown sandbox capability: ${capability}`,
      capability,
      permissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      deniedPermissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      requiresExplicitApproval: false,
    };
  }

  if (!capabilityDefinition.allowedSurfaces.includes(input.surface)) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `capability ${capability} is not allowed on ${input.surface}`,
      capability,
      riskLevel: capabilityDefinition.riskLevel,
      permissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      deniedPermissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      requiresExplicitApproval: capabilityDefinition.requiresExplicitApproval,
    };
  }

  const runtimeOwner = policy.runtimeOwner ?? 'plugin-extension';
  if (!capabilityDefinition.allowedRuntimeOwners.includes(runtimeOwner)) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `runtime owner ${runtimeOwner} is not allowed for capability ${capability}`,
      capability,
      riskLevel: capabilityDefinition.riskLevel,
      permissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      deniedPermissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      requiresExplicitApproval: capabilityDefinition.requiresExplicitApproval,
    };
  }

  const manifest = findManifestByPluginId(pluginId);
  if (!manifest) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `plugin manifest not found for ${pluginId}`,
      capability,
      riskLevel: capabilityDefinition.riskLevel,
      permissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      deniedPermissionKeys: policy.permissionKeys ? [...policy.permissionKeys] : [],
      requiresExplicitApproval: capabilityDefinition.requiresExplicitApproval,
    };
  }

  const requestedPermissionKeys = policy.permissionKeys ? [...policy.permissionKeys] : [];
  if (requestedPermissionKeys.length === 0) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `sandbox policy for ${capability} must include at least one permission key`,
      capability,
      riskLevel: capabilityDefinition.riskLevel,
      permissionKeys: [],
      deniedPermissionKeys: [],
      requiresExplicitApproval: capabilityDefinition.requiresExplicitApproval,
    };
  }

  const declaredPermissions = manifest.permissions ?? [];
  const deniedPermissionKeys = requestedPermissionKeys.filter((permissionKey) => {
    const declared = declaredPermissions.find((entry) => entry.key === permissionKey);
    if (!declared) {
      return true;
    }
    return declared.capability !== capability || declared.scope !== policy.scope;
  });

  if (deniedPermissionKeys.length > 0) {
    return {
      allowed: false,
      executionId,
      pluginId,
      surface: input.surface,
      reason: `permission declarations do not authorize capability ${capability}`,
      capability,
      riskLevel: capabilityDefinition.riskLevel,
      permissionKeys: requestedPermissionKeys,
      deniedPermissionKeys,
      requiresExplicitApproval: capabilityDefinition.requiresExplicitApproval,
    };
  }

  const requiresExplicitApproval =
    capabilityDefinition.requiresExplicitApproval || policy.scope === 'policy-scoped';
  if (requiresExplicitApproval) {
    const loadApproval =
      input.loadCapabilityApproval ??
      ((params: { pluginId: string; capability: string }) =>
        loadCapabilityApprovalFromDb(params.pluginId, params.capability));
    const isApproved = await loadApproval({ pluginId, capability });
    if (!isApproved) {
      return {
        allowed: false,
        executionId,
        pluginId,
        surface: input.surface,
        reason: `explicit approval missing for capability ${capability}`,
        capability,
        riskLevel: capabilityDefinition.riskLevel,
        permissionKeys: requestedPermissionKeys,
        deniedPermissionKeys: requestedPermissionKeys,
        requiresExplicitApproval,
      };
    }
  }

  return {
    allowed: true,
    executionId,
    pluginId,
    surface: input.surface,
    reason: `capability ${capability} authorized for ${input.resourceId}`,
    capability,
    riskLevel: capabilityDefinition.riskLevel,
    permissionKeys: requestedPermissionKeys,
    deniedPermissionKeys: [],
    requiresExplicitApproval,
  };
}

export function recordPluginSandboxDecision(decision: PluginSandboxAccessDecision): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const payload = {
    executionId: decision.executionId,
    pluginId: decision.pluginId,
    surface: decision.surface,
    capability: decision.capability,
    riskLevel: decision.riskLevel,
    allowed: decision.allowed,
    reason: decision.reason,
    permissionKeys: decision.permissionKeys,
    deniedPermissionKeys: decision.deniedPermissionKeys,
    requiresExplicitApproval: decision.requiresExplicitApproval,
  };

  if (decision.allowed) {
    console.info('plugin sandbox allow', payload);
    return;
  }

  console.warn('plugin sandbox deny', payload);
}
