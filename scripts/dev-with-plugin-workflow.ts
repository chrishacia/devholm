#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildCanonicalPluginSourceResolution,
  LOCAL_PLUGIN_OVERRIDE_ENV,
} from '../src/core/lib/plugin-development-source-resolution.server';

const DEV_RESOLUTION_ENV = 'development';
const REBUILD_DEBOUNCE_MS = 200;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function generateRegistry(): Promise<number> {
  const env = {
    ...process.env,
    DEVHOLM_PLUGIN_RESOLUTION_ENV: DEV_RESOLUTION_ENV,
  };

  return runCommand('pnpm', ['plugins:generate'], env);
}

function watchPathRecursive(
  targetPath: string,
  onEvent: (reason: string) => void
): fs.FSWatcher | null {
  try {
    return fs.watch(targetPath, { recursive: true }, (_eventType, fileName) => {
      const suffix = typeof fileName === 'string' && fileName.length > 0 ? `/${fileName}` : '';
      onEvent(`change detected in ${targetPath}${suffix}`);
    });
  } catch (error) {
    log(
      `[plugins:dev] watcher unavailable for ${targetPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function main(): Promise<void> {
  const rootDir = process.cwd();

  const configured = buildCanonicalPluginSourceResolution({
    environment: DEV_RESOLUTION_ENV,
    rootDir,
    overrideRaw: process.env[LOCAL_PLUGIN_OVERRIDE_ENV],
  });

  if (configured.appliedOverrides.length > 0) {
    for (const override of configured.appliedOverrides) {
      log(
        `[plugins:dev] local override active for ${override.pluginId}: ${override.filesystemPath}`
      );
    }
  } else {
    log('[plugins:dev] running with bundled default plugin sources');
  }

  const firstGenerationExit = await generateRegistry();
  if (firstGenerationExit !== 0) {
    process.exit(firstGenerationExit);
  }

  let rebuildTimer: NodeJS.Timeout | null = null;
  let rebuildInFlight = false;
  let pendingReason: string | null = null;
  let nextDevExited = false;

  function requestRebuild(reason: string): void {
    pendingReason = reason;
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }

    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      void runRebuild();
    }, REBUILD_DEBOUNCE_MS);
  }

  async function runRebuild(): Promise<void> {
    if (rebuildInFlight || nextDevExited) {
      return;
    }

    rebuildInFlight = true;
    const reason = pendingReason ?? 'unspecified plugin source change';
    pendingReason = null;

    log(`[plugins:dev] regenerating plugin registry (${reason})`);
    const exitCode = await generateRegistry();
    if (exitCode !== 0) {
      log(
        `[plugins:dev] registry generation failed with exit code ${exitCode}; watcher remains active for recovery`
      );
    }

    rebuildInFlight = false;
    if (pendingReason) {
      void runRebuild();
    }
  }

  const watchRoots = new Set<string>([
    path.join(rootDir, 'src/user/extensions/plugins'),
    ...configured.appliedOverrides.map((override) => override.filesystemPath),
  ]);

  const watchers = Array.from(watchRoots)
    .map((watchRoot) => watchPathRecursive(watchRoot, requestRebuild))
    .filter((watcher): watcher is fs.FSWatcher => Boolean(watcher));

  const nextDev = spawn('pnpm', ['exec', 'next', 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DEVHOLM_PLUGIN_RESOLUTION_ENV: DEV_RESOLUTION_ENV,
    },
  });

  const cleanup = () => {
    for (const watcher of watchers) {
      watcher.close();
    }

    if (!nextDev.killed) {
      nextDev.kill('SIGTERM');
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  nextDev.on('close', (code) => {
    nextDevExited = true;
    cleanup();
    process.exit(code ?? 0);
  });

  nextDev.on('error', (error) => {
    nextDevExited = true;
    cleanup();
    process.stderr.write(
      `[plugins:dev] next dev failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}

void main().catch((error) => {
  process.stderr.write(
    `[plugins:dev] failed to start development workflow: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exit(1);
});
