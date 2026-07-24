import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface BoundaryCheck {
  path: string;
  mayReferenceLegacyEnabledSetting: boolean;
}

const boundary: BoundaryCheck[] = [
  {
    path: 'src/core/lib/plugin-cutover-legacy-reconciler.server.ts',
    mayReferenceLegacyEnabledSetting: true,
  },
  {
    path: 'src/core/lib/plugin-cutover-state-snapshot.server.ts',
    mayReferenceLegacyEnabledSetting: true,
  },
  {
    path: 'src/core/lib/plugin-cutover-cleanup-planner.server.ts',
    mayReferenceLegacyEnabledSetting: true,
  },
  {
    path: 'src/core/db/plugins.ts',
    mayReferenceLegacyEnabledSetting: true,
  },
  {
    path: 'src/core/lib/event-dispatcher.server.ts',
    mayReferenceLegacyEnabledSetting: false,
  },
  {
    path: 'src/core/lib/job-queue.server.ts',
    mayReferenceLegacyEnabledSetting: false,
  },
  {
    path: 'src/core/db/plugins-enabled.ts',
    mayReferenceLegacyEnabledSetting: false,
  },
];

describe('plugin legacy ownership boundary', () => {
  it('limits runtime legacy enabled-setting references to explicit compatibility/cutover modules', () => {
    const violatingPaths: string[] = [];

    for (const check of boundary) {
      const absolutePath = path.join(process.cwd(), check.path);
      const content = readFileSync(absolutePath, 'utf8');

      const referencesLegacyEnabledSetting =
        content.includes('plugin:${pluginId}:enabled') ||
        content.includes('plugin:%:enabled') ||
        content.includes('plugin:enabled');

      if (referencesLegacyEnabledSetting && !check.mayReferenceLegacyEnabledSetting) {
        violatingPaths.push(check.path);
      }
    }

    expect(violatingPaths).toEqual([]);
  });
});
