import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  buildCanonicalPluginSourceResolution,
  LOCAL_PLUGIN_OVERRIDE_ENV,
} from '../src/core/lib/plugin-development-source-resolution.server';
import {
  createProductionBuildPreparationManifest,
  writeProductionBuildPreparationManifest,
} from '../src/core/lib/plugin-production-build-preparation.server';
import { verifyDeterministicCanonicalRegistry } from '../src/core/lib/plugin-canonical-resolver.server';
import type { CanonicalResolverRegistrySnapshot } from '../src/core/types/plugin-canonical-resolver';

export function assertPnpmExecutionSucceeded(
  args: readonly string[],
  result: ReturnType<typeof spawnSync>
): void {
  if (result.error) {
    throw new Error(`pnpm ${args.join(' ')} failed to start: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`pnpm ${args.join(' ')} terminated by signal ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function runPnpm(rootDir: string, args: readonly string[]): void {
  const result = spawnSync('pnpm', args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEVHOLM_PLUGIN_RESOLUTION_ENV: 'production',
    },
  });

  assertPnpmExecutionSucceeded(args, result);
}

function readGeneratedRegistry(rootDir: string): CanonicalResolverRegistrySnapshot {
  const registryPath = path.join(rootDir, 'generated/plugins/registry.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `Generated registry is missing at ${registryPath}. Run pnpm plugins:generate first.`
    );
  }

  return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as CanonicalResolverRegistrySnapshot;
}

function main(): void {
  const rootDir = process.cwd();
  const overrideRaw = process.env[LOCAL_PLUGIN_OVERRIDE_ENV];

  runPnpm(rootDir, ['plugins:generate']);
  runPnpm(rootDir, ['plugins:check']);

  const configured = buildCanonicalPluginSourceResolution({
    environment: 'production',
    rootDir,
    overrideRaw,
  });

  const registry = readGeneratedRegistry(rootDir);
  const verification = verifyDeterministicCanonicalRegistry(registry);
  if (!verification.ok) {
    throw new Error(
      `Generated registry verification failed (${verification.errorCode ?? 'unknown'}): expected ${verification.expectedDigestSha256}, found ${verification.actualDigestSha256}`
    );
  }

  const manifest = createProductionBuildPreparationManifest({
    environment: 'production',
    entries: configured.entries,
    registry,
    registryVerification: verification,
  });

  const outputPath = writeProductionBuildPreparationManifest(rootDir, manifest);
  console.log(`Generated production build preparation at ${outputPath}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
