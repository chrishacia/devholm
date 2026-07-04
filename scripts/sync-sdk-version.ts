/**
 * sync-sdk-version.ts
 *
 * Reads the root package.json "version" field and writes the same value into
 * packages/sdk/package.json, ensuring lockstep versioning during every release.
 *
 * Called by the release-it "after:bump" hook so the SDK manifest is updated
 * atomically in the same release commit as the root manifest.
 *
 * Usage (direct):
 *   tsx scripts/sync-sdk-version.ts [<root-manifest>] [<sdk-manifest>]
 *
 * If paths are omitted, defaults to repo-relative locations.
 *
 * Exported as syncSdkVersion() for unit testing with fixture paths.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Core function (testable with any paths)
// ---------------------------------------------------------------------------

export function syncSdkVersion(rootManifestPath: string, sdkManifestPath: string): void {
  // --- Read root manifest ---
  let rootRaw: string;
  try {
    rootRaw = readFileSync(rootManifestPath, 'utf8');
  } catch (err) {
    throw new Error(
      `sync-sdk-version: cannot read root manifest at "${rootManifestPath}": ${(err as Error).message}`
    );
  }

  let rootManifest: Record<string, unknown>;
  try {
    rootManifest = JSON.parse(rootRaw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`sync-sdk-version: root manifest is not valid JSON: ${(err as Error).message}`);
  }

  const rootVersion = rootManifest['version'];
  if (typeof rootVersion !== 'string' || rootVersion.trim().length === 0) {
    throw new Error(
      `sync-sdk-version: root manifest has no valid "version" field (got ${JSON.stringify(rootVersion)})`
    );
  }

  // --- Read SDK manifest ---
  let sdkRaw: string;
  try {
    sdkRaw = readFileSync(sdkManifestPath, 'utf8');
  } catch (err) {
    throw new Error(
      `sync-sdk-version: cannot read SDK manifest at "${sdkManifestPath}": ${(err as Error).message}`
    );
  }

  let sdkManifest: Record<string, unknown>;
  try {
    sdkManifest = JSON.parse(sdkRaw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`sync-sdk-version: SDK manifest is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof sdkManifest['version'] !== 'string') {
    throw new Error(`sync-sdk-version: SDK manifest has no "version" field`);
  }

  // --- Update only the version field ---
  // Preserve all other fields and trailing-newline convention.
  sdkManifest['version'] = rootVersion;
  writeFileSync(sdkManifestPath, JSON.stringify(sdkManifest, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = resolve(__dirname, '..');
const defaultRoot = resolve(repoRoot, 'package.json');
const defaultSdk = resolve(repoRoot, 'packages', 'sdk', 'package.json');

const rootArg = process.argv[2] ?? defaultRoot;
const sdkArg = process.argv[3] ?? defaultSdk;

try {
  syncSdkVersion(rootArg, sdkArg);
  const { version } = JSON.parse(readFileSync(rootArg, 'utf8')) as {
    version: string;
  };
  console.log(`sync-sdk-version: synced SDK version to ${version}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
