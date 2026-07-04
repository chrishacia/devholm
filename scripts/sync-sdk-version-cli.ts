/**
 * sync-sdk-version-cli.ts
 *
 * CLI entrypoint for syncing SDK package version with root package version.
 *
 * Usage:
 *   tsx scripts/sync-sdk-version-cli.ts [<root-manifest>] [<sdk-manifest>]
 *
 * If paths are omitted, defaults to repo-relative locations.
 *
 * Called by the release-it "after:bump" hook so the SDK manifest is updated
 * atomically in the same release commit as the root manifest.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { syncSdkVersion } from './sync-sdk-version.js';

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
