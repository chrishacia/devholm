import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type GuardExpectation = {
  file: string;
  requiredPatterns: RegExp[];
  forbiddenPatterns?: RegExp[];
};

const expectations: GuardExpectation[] = [
  {
    file: 'src/core/lib/plugin-cutover-cleanup-executor.server.ts',
    requiredPatterns: [/acquirePluginLifecycleTransactionLock\(/, /db\.transaction\(async \(trx\)/],
  },
  {
    file: 'src/core/lib/plugin-cutover-rollback-executor.server.ts',
    requiredPatterns: [/acquirePluginLifecycleTransactionLock\(/, /db\.transaction\(async \(trx\)/],
    forbiddenPatterns: [/withPluginLifecycleSessionLock\(/],
  },
  {
    file: 'src/core/lib/plugin-cutover-legacy-reconciler.server.ts',
    requiredPatterns: [/acquirePluginLifecycleTransactionLock\(/, /db\.transaction\(async \(trx\)/],
    forbiddenPatterns: [/withPluginLifecycleSessionLock\(/],
  },
  {
    file: 'src/core/lib/plugin-cutover-legacy-decommission.server.ts',
    requiredPatterns: [/acquirePluginLifecycleTransactionLock\(/, /db\.transaction\(async \(trx\)/],
    forbiddenPatterns: [/withPluginLifecycleSessionLock\(/],
  },
  {
    file: 'src/core/lib/plugin-lifecycle-recovery-runner.server.ts',
    requiredPatterns: [/executePluginCutoverRollback\(/],
    forbiddenPatterns: [/withPluginLifecycleSessionLock\(/],
  },
];

describe('cutover coordination invariant', () => {
  it('keeps Issue #103 mutation writers behind lifecycle coordination boundary', () => {
    const root = process.cwd();

    for (const entry of expectations) {
      const absolutePath = path.join(root, entry.file);
      const source = readFileSync(absolutePath, 'utf8');

      for (const pattern of entry.requiredPatterns) {
        expect(source, `${entry.file} missing ${pattern}`).toMatch(pattern);
      }

      for (const pattern of entry.forbiddenPatterns ?? []) {
        expect(source, `${entry.file} should not include ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
