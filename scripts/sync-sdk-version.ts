/**
 * sync-sdk-version.ts
 *
 * Pure library for syncing SDK package version with root package version.
 *
 * This module is import-safe: it has no side effects, no logging, no process.exit calls,
 * and does not execute on import. Use this when you need to test sync logic with fixtures.
 *
 * For CLI usage, import sync-sdk-version-cli.ts instead.
 */

import { readFileSync, writeFileSync } from 'fs';

/**
 * Reads the root package.json "version" field and writes the same value into
 * packages/sdk/package.json, ensuring lockstep versioning during every release.
 *
 * @param rootManifestPath - Path to root package.json
 * @param sdkManifestPath - Path to packages/sdk/package.json
 * @throws If manifests cannot be read, parsed, or lack valid "version" fields
 */
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
