import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assertPnpmExecutionSucceeded } from '../../scripts/plugins-prepare-production';

function makeResult(
  overrides: Partial<ReturnType<typeof spawnSync>> = {}
): ReturnType<typeof spawnSync> {
  return {
    pid: 123,
    output: [null, null, null],
    stdout: null,
    stderr: null,
    status: 0,
    signal: null,
    ...overrides,
  } as ReturnType<typeof spawnSync>;
}

describe('plugins:prepare-production pnpm diagnostics', () => {
  it('reports spawn startup errors', () => {
    const result = makeResult({ error: new Error('ENOENT: pnpm not found') });

    expect(() => assertPnpmExecutionSucceeded(['plugins:generate'], result)).toThrow(
      /failed to start: ENOENT: pnpm not found/
    );
  });

  it('reports signal termination with the concrete signal', () => {
    const result = makeResult({ status: null, signal: 'SIGKILL' });

    expect(() => assertPnpmExecutionSucceeded(['plugins:check'], result)).toThrow(
      /terminated by signal SIGKILL/
    );
  });

  it('reports non-zero numeric exit codes', () => {
    const result = makeResult({ status: 7, signal: null });

    expect(() => assertPnpmExecutionSucceeded(['plugins:generate'], result)).toThrow(
      /failed with exit code 7/
    );
  });

  it('reports unknown termination state when no status or signal is present', () => {
    const result = makeResult({ status: null, signal: null });

    expect(() => assertPnpmExecutionSucceeded(['plugins:check'], result)).toThrow(
      /failed with exit code unknown/
    );
  });

  it('does not throw when pnpm exits successfully', () => {
    const result = makeResult({ status: 0, signal: null });

    expect(() => assertPnpmExecutionSucceeded(['plugins:generate'], result)).not.toThrow();
  });
});
