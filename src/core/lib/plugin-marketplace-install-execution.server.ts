import { access, chmod, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { buildMarketplaceInstallDryRunPlan } from '@core/lib/plugin-marketplace-install-planner.server';
import {
  computeArtifactSha256,
  extractTarGzToStaging,
  inspectTarGzArtifact,
} from '@core/lib/plugin-marketplace-staging.server';
import type {
  MarketplaceFirstPartyInstallExecutionInput,
  MarketplaceFirstPartyInstallExecutionResult,
} from '@core/types/plugin-marketplace-install-execution';

interface MarketplaceFirstPartyInstallState {
  pluginId: string;
  currentVersion: string;
  currentPath: string;
  previousVersion: string | null;
  previousPath: string | null;
  updatedAt: string;
  updatedBy?: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const DEFAULT_FIRST_PARTY_INSTALL_ROOT = path.resolve(
  process.cwd(),
  'generated/plugins/marketplace-first-party'
);

function stateFilePath(pluginInstallRoot: string): string {
  return path.join(pluginInstallRoot, 'install-state.json');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readInstallState(
  pluginInstallRoot: string
): Promise<MarketplaceFirstPartyInstallState | null> {
  const filePath = stateFilePath(pluginInstallRoot);
  if (!(await pathExists(filePath))) {
    return null;
  }

  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as MarketplaceFirstPartyInstallState;
}

async function writeInstallState(
  pluginInstallRoot: string,
  state: MarketplaceFirstPartyInstallState
): Promise<void> {
  await writeFile(stateFilePath(pluginInstallRoot), JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}

function assertSha256(value: string | undefined, fieldName: string): string {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a valid 64-character lowercase SHA-256 hex digest`);
  }
  return normalized;
}

export async function executeFirstPartyMarketplaceInstall(
  input: MarketplaceFirstPartyInstallExecutionInput
): Promise<MarketplaceFirstPartyInstallExecutionResult> {
  if (!input.explicitAdminApproval) {
    throw new Error('explicit admin approval is required for first-party runtime install');
  }

  const plan = buildMarketplaceInstallDryRunPlan({
    descriptor: input.descriptor,
    catalogEntry: input.catalogEntry,
  });

  if (plan.outcome === 'blocked') {
    throw new Error(`planner blocked runtime install: ${plan.summary}`);
  }

  if (plan.outcome === 'approval-required' && !input.explicitAdminApproval) {
    throw new Error(`planner blocked runtime install: ${plan.summary}`);
  }

  const expectedCatalogChecksum = assertSha256(
    input.catalogEntry.artifact.sha256,
    'catalog sha256'
  );
  if (input.descriptor.integrity?.packageChecksum !== undefined) {
    const expectedDescriptorChecksum = assertSha256(
      input.descriptor.integrity.packageChecksum,
      'descriptor integrity.packageChecksum'
    );
    if (expectedDescriptorChecksum !== expectedCatalogChecksum) {
      throw new Error(
        'descriptor integrity.packageChecksum does not match catalog artifact.sha256'
      );
    }
  }

  const computedChecksum = (await computeArtifactSha256(input.artifactPath)).toLowerCase();
  if (computedChecksum !== expectedCatalogChecksum) {
    throw new Error(
      `artifact checksum mismatch: expected ${expectedCatalogChecksum}, got ${computedChecksum}`
    );
  }

  const inspection = await inspectTarGzArtifact(input.artifactPath);
  const extraction = await extractTarGzToStaging(input.artifactPath);

  try {
    if (extraction.validation.pluginId !== input.descriptor.expectedPluginId) {
      throw new Error(
        `staged manifest pluginId ${extraction.validation.pluginId} does not match descriptor expectedPluginId ${input.descriptor.expectedPluginId}`
      );
    }

    if (extraction.validation.version !== input.descriptor.expectedVersion) {
      throw new Error(
        `staged manifest version ${extraction.validation.version} does not match descriptor expectedVersion ${input.descriptor.expectedVersion}`
      );
    }

    if (extraction.validation.pluginId !== input.catalogEntry.pluginId) {
      throw new Error(
        `staged manifest pluginId ${extraction.validation.pluginId} does not match catalog pluginId ${input.catalogEntry.pluginId}`
      );
    }

    if (extraction.validation.version !== input.catalogEntry.version) {
      throw new Error(
        `staged manifest version ${extraction.validation.version} does not match catalog version ${input.catalogEntry.version}`
      );
    }

    if (extraction.validation.packageRoot !== input.catalogEntry.pluginSubdirectory) {
      throw new Error(
        `staged package root ${extraction.validation.packageRoot} does not match catalog pluginSubdirectory ${input.catalogEntry.pluginSubdirectory}`
      );
    }

    const installRoot = path.resolve(
      input.generatedPluginsRoot ?? DEFAULT_FIRST_PARTY_INSTALL_ROOT
    );
    const pluginInstallRoot = path.join(installRoot, extraction.validation.pluginId);
    const versionsRoot = path.join(pluginInstallRoot, 'versions');
    const rollbacksRoot = path.join(pluginInstallRoot, 'rollbacks');
    const activePath = path.join(pluginInstallRoot, 'active');
    const versionPath = path.join(versionsRoot, extraction.validation.version);

    await mkdir(pluginInstallRoot, { recursive: true, mode: 0o700 });
    await mkdir(versionsRoot, { recursive: true, mode: 0o700 });
    await mkdir(rollbacksRoot, { recursive: true, mode: 0o700 });
    await chmod(pluginInstallRoot, 0o700);

    if (await pathExists(versionPath)) {
      throw new Error(
        `version ${extraction.validation.version} is already installed for plugin ${extraction.validation.pluginId}`
      );
    }

    const packageSourceRoot = path.join(
      extraction.stagingDirectory,
      extraction.validation.packageRoot
    );
    await cp(packageSourceRoot, versionPath, { recursive: true, errorOnExist: true, force: false });

    const previousState = await readInstallState(pluginInstallRoot);
    const stagedActivePath = path.join(
      pluginInstallRoot,
      `.active-next-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`
    );

    await cp(versionPath, stagedActivePath, { recursive: true, errorOnExist: true, force: false });

    let rollbackPath: string | null = null;
    const hadActivePath = await pathExists(activePath);

    if (hadActivePath) {
      rollbackPath = path.join(
        rollbacksRoot,
        `${previousState?.currentVersion ?? 'unknown'}-${Date.now().toString(36)}`
      );
      await rename(activePath, rollbackPath);
    }

    try {
      await rename(stagedActivePath, activePath);
    } catch (error) {
      await rm(stagedActivePath, { recursive: true, force: true });
      if (rollbackPath && (await pathExists(rollbackPath))) {
        await rename(rollbackPath, activePath);
      }
      throw error;
    }

    const installedAt = new Date().toISOString();
    const nextState: MarketplaceFirstPartyInstallState = {
      pluginId: extraction.validation.pluginId,
      currentVersion: extraction.validation.version,
      currentPath: activePath,
      previousVersion: previousState?.currentVersion ?? null,
      previousPath: rollbackPath,
      updatedAt: installedAt,
      updatedBy: input.initiatedBy,
    };

    await writeInstallState(pluginInstallRoot, nextState);

    return {
      pluginId: extraction.validation.pluginId,
      version: extraction.validation.version,
      sha256: computedChecksum,
      plannerSummary: plan.summary,
      inspection,
      validation: extraction.validation,
      installRoot,
      activePath,
      versionPath,
      previousVersion: nextState.previousVersion,
      rollbackPath: nextState.previousPath,
      lifecycleExecution: 'skipped',
      migrationExecution: 'skipped',
      installedAt,
    };
  } finally {
    await rm(extraction.stagingDirectory, { recursive: true, force: true });
  }
}
