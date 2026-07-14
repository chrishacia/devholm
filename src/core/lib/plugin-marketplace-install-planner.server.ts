import {
  normalizeGitHubRepoUrl,
  validateMarketplaceInstallSourceDescriptor,
} from '@core/lib/plugin-install-source-descriptor.server';
import { evaluateMarketplacePublisherTrustPolicy } from '@core/lib/plugin-marketplace-publisher-trust.server';
import { validateMarketplaceCatalogEntry } from '@core/lib/plugin-marketplace-contract.server';
import { verifyMarketplaceArtifactSignature } from '@core/lib/plugin-marketplace-signing.server';
import type {
  MarketplaceInstallPlannerApprovalRequirement,
  MarketplaceInstallPlannerBlocker,
  MarketplaceInstallPlannerInput,
  MarketplaceInstallPlannerResult,
  MarketplaceInstallPlannerStateResult,
} from '@core/types/plugin-marketplace-install-planner';

function pushBlockedState(
  states: MarketplaceInstallPlannerStateResult[],
  state: MarketplaceInstallPlannerStateResult['state'],
  notes: string[]
): void {
  states.push({ state, status: 'blocked', notes });
}

function pushPassedState(
  states: MarketplaceInstallPlannerStateResult[],
  state: MarketplaceInstallPlannerStateResult['state'],
  notes: string[]
): void {
  states.push({ state, status: 'passed', notes });
}

export function buildMarketplaceInstallDryRunPlan(
  input: MarketplaceInstallPlannerInput
): MarketplaceInstallPlannerResult {
  const blockers: MarketplaceInstallPlannerBlocker[] = [];
  const approvals: MarketplaceInstallPlannerApprovalRequirement[] = [];
  const states: MarketplaceInstallPlannerStateResult[] = [];

  const descriptorErrors = validateMarketplaceInstallSourceDescriptor(input.descriptor);
  if (descriptorErrors.length > 0) {
    for (const error of descriptorErrors) {
      blockers.push({ code: 'descriptor-invalid', message: error });
    }
    pushBlockedState(states, 'validate_descriptor', descriptorErrors);
  } else {
    pushPassedState(states, 'validate_descriptor', ['descriptor is structurally valid']);
  }

  const catalogErrors = validateMarketplaceCatalogEntry(input.catalogEntry);
  if (catalogErrors.length > 0) {
    for (const error of catalogErrors) {
      blockers.push({ code: 'catalog-entry-invalid', message: error });
    }
    pushBlockedState(states, 'validate_catalog_entry', catalogErrors);
  } else {
    pushPassedState(states, 'validate_catalog_entry', ['catalog entry is structurally valid']);
  }

  const runtimeReady =
    input.catalogEntry.artifact.readiness === 'available' ||
    input.catalogEntry.installReadiness === 'production-eligible';

  let signatureTrust: ReturnType<typeof verifyMarketplaceArtifactSignature> | null = null;
  if (runtimeReady) {
    signatureTrust = verifyMarketplaceArtifactSignature({
      catalogEntry: input.catalogEntry,
      signature: input.catalogEntry.artifact.signature,
      trustedKeys: input.trustedKeys ?? [],
      verificationTimestamp: input.verificationTimestamp,
    });

    if (signatureTrust.trustDecision !== 'trusted') {
      blockers.push({
        code: 'artifact-signature-untrusted',
        message: `artifact signature trust check failed: ${signatureTrust.verificationStatus}`,
      });
      pushBlockedState(states, 'verify_signature_trust', [
        `signature trust failed (${signatureTrust.verificationStatus})`,
      ]);
    } else {
      pushPassedState(states, 'verify_signature_trust', ['signature trust verified']);
    }

    const trustPolicyDecision = evaluateMarketplacePublisherTrustPolicy({
      publisherId: input.catalogEntry.publisher.publisherId,
      publisherClass: input.catalogEntry.publisher.classification,
      signingKeyId: signatureTrust.keyId,
      pluginId: input.catalogEntry.pluginId,
      artifactChannel: input.requestedArtifactChannel,
      siteScope: input.requestedSiteScope,
      operation: input.requestedOperation ?? 'install',
      policyDocument: input.publisherTrustPolicy ?? null,
      evaluatedAt: input.verificationTimestamp,
    });

    if (trustPolicyDecision.outcome !== 'allow') {
      blockers.push({
        code: 'publisher-policy-denied',
        message: `publisher trust policy denied install: ${trustPolicyDecision.reasonCode}`,
      });
      pushBlockedState(states, 'evaluate_publisher_trust_policy', [
        `publisher trust denied (${trustPolicyDecision.reasonCode})`,
      ]);
    } else {
      pushPassedState(states, 'evaluate_publisher_trust_policy', [
        `publisher trust policy allowed (${trustPolicyDecision.reasonCode})`,
      ]);
    }
  } else {
    pushPassedState(states, 'verify_signature_trust', [
      'signature trust check skipped for non-runtime-ready entry',
    ]);
    pushPassedState(states, 'evaluate_publisher_trust_policy', [
      'publisher trust policy check skipped for non-runtime-ready entry',
    ]);
  }

  const consistencyNotes: string[] = [];
  if (input.descriptor.expectedPluginId !== input.catalogEntry.pluginId) {
    blockers.push({
      code: 'plugin-id-mismatch',
      message: `descriptor expectedPluginId ${input.descriptor.expectedPluginId} does not match catalog pluginId ${input.catalogEntry.pluginId}`,
    });
  } else {
    consistencyNotes.push('pluginId matches descriptor expectation');
  }

  if (input.descriptor.expectedVersion !== input.catalogEntry.version) {
    blockers.push({
      code: 'version-mismatch',
      message: `descriptor expectedVersion ${input.descriptor.expectedVersion} does not match catalog version ${input.catalogEntry.version}`,
    });
  } else {
    consistencyNotes.push('version matches descriptor expectation');
  }

  if (input.descriptor.pluginSubdirectory !== input.catalogEntry.pluginSubdirectory) {
    blockers.push({
      code: 'plugin-subdirectory-mismatch',
      message: `descriptor pluginSubdirectory ${input.descriptor.pluginSubdirectory} does not match catalog pluginSubdirectory ${input.catalogEntry.pluginSubdirectory}`,
    });
  } else {
    consistencyNotes.push('pluginSubdirectory matches catalog entry');
  }

  if (input.descriptor.manifestPath !== input.catalogEntry.manifestPath) {
    blockers.push({
      code: 'manifest-path-mismatch',
      message: `descriptor manifestPath ${input.descriptor.manifestPath} does not match catalog manifestPath ${input.catalogEntry.manifestPath}`,
    });
  } else {
    consistencyNotes.push('manifestPath matches catalog entry');
  }

  const descriptorRepo = normalizeGitHubRepoUrl(input.descriptor.repoUrl);
  const catalogRepo = normalizeGitHubRepoUrl(input.catalogEntry.source.repositoryUrl);
  if (!descriptorRepo || !catalogRepo || descriptorRepo !== catalogRepo) {
    blockers.push({
      code: 'repo-url-mismatch',
      message: `descriptor repoUrl ${input.descriptor.repoUrl} does not match catalog source.repositoryUrl ${input.catalogEntry.source.repositoryUrl}`,
    });
  } else {
    consistencyNotes.push('repositoryUrl matches catalog source');
  }

  if (input.descriptor.ref !== input.catalogEntry.source.ref) {
    blockers.push({
      code: 'ref-mismatch',
      message: `descriptor ref ${input.descriptor.ref} does not match catalog source.ref ${input.catalogEntry.source.ref}`,
    });
  } else {
    consistencyNotes.push('source ref matches catalog source');
  }

  if (consistencyNotes.length === 0 || blockers.some((item) => item.code.endsWith('mismatch'))) {
    pushBlockedState(
      states,
      'consistency_checks',
      consistencyNotes.length > 0 ? consistencyNotes : ['consistency checks failed']
    );
  } else {
    pushPassedState(states, 'consistency_checks', consistencyNotes);
  }

  if (input.catalogEntry.installReadiness !== 'production-eligible') {
    blockers.push({
      code: 'readiness-not-production-eligible',
      message: `installReadiness must be production-eligible for dry-run install planning; received ${input.catalogEntry.installReadiness}`,
    });
  }

  if (!input.catalogEntry.runtimeInstallSupported) {
    blockers.push({
      code: 'runtime-install-unsupported',
      message: 'runtimeInstallSupported must be true for dry-run install planning',
    });
  }

  if (input.catalogEntry.artifact.readiness !== 'available') {
    blockers.push({
      code: 'artifact-not-available',
      message: `artifact.readiness must be available for dry-run install planning; received ${input.catalogEntry.artifact.readiness}`,
    });
  }

  if (!input.catalogEntry.artifact.artifactUrl) {
    blockers.push({
      code: 'artifact-missing-url',
      message: 'artifact.artifactUrl is required for dry-run install planning',
    });
  }

  if (!input.catalogEntry.artifact.sha256) {
    blockers.push({
      code: 'artifact-missing-sha256',
      message: 'artifact.sha256 is required for dry-run install planning',
    });
  }

  if (!input.catalogEntry.artifact.immutable) {
    blockers.push({
      code: 'artifact-not-immutable',
      message: 'artifact.immutable must be true for dry-run install planning',
    });
  }

  if (
    input.descriptor.trustPolicy?.policy === 'manual-approval' ||
    (input.descriptor.trustPolicy?.requiredApprovers?.length ?? 0) > 0
  ) {
    approvals.push({
      code: 'manual-approval-required',
      message: 'manual approvals are required by descriptor trust policy',
      requiredApprovers: [...(input.descriptor.trustPolicy?.requiredApprovers ?? [])].sort(),
    });
  }

  for (const blocker of input.capabilityContract?.blockers ?? []) {
    blockers.push({
      code: 'capability-escalation-blocked',
      message: blocker,
    });
  }

  const capabilityApprovals = input.capabilityContract?.approvals ?? [];
  if (capabilityApprovals.length > 0) {
    approvals.push({
      code: 'capability-escalation-review-required',
      message: `capability escalation review required: ${capabilityApprovals.join('; ')}`,
      requiredApprovers: [],
    });
  }

  if (blockers.length > 0) {
    pushBlockedState(states, 'approval_gate', ['approval gate not reachable while blockers exist']);
    pushBlockedState(states, 'ready_for_staging', ['planner blocked before staging']);

    return {
      outcome: 'blocked',
      states,
      blockers,
      approvals,
      summary: `blocked: ${blockers.length} blocker(s) detected`,
    };
  }

  if (approvals.length > 0) {
    states.push({
      state: 'approval_gate',
      status: 'pending_approval',
      notes: ['manual approvals are required before staging'],
    });
    states.push({
      state: 'ready_for_staging',
      status: 'pending_approval',
      notes: ['planner is waiting on approval requirements'],
    });

    return {
      outcome: 'approval-required',
      states,
      blockers,
      approvals,
      summary: `approval-required: ${approvals.length} approval requirement(s)`,
    };
  }

  pushPassedState(states, 'approval_gate', ['no manual approvals required']);
  pushPassedState(states, 'ready_for_staging', [
    'dry-run planner indicates staging may begin',
    'no install execution is performed by this planner',
  ]);

  return {
    outcome: 'ready',
    states,
    blockers,
    approvals,
    summary: 'ready: dry-run planning completed with no blockers',
  };
}

export function canProceedToStaging(plan: MarketplaceInstallPlannerResult): boolean {
  return plan.outcome === 'ready';
}
