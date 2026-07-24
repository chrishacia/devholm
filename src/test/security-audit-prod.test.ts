import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const scriptPath = resolve(process.cwd(), 'scripts/security-audit-prod.ts');

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'devholm-security-audit-'));
  tempDirectories.push(tempDirectory);
  return tempDirectory;
}

function writeFixture(payload: unknown): string {
  const directory = createTempDirectory();
  const fixturePath = join(directory, 'audit-fixture.json');
  writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
  return fixturePath;
}

function runAuditScript(fixturePath: string, reportPath: string) {
  return spawnSync('pnpm', ['exec', 'tsx', scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      DEVHOLM_SECURITY_AUDIT_FIXTURE: fixturePath,
      DEVHOLM_SECURITY_AUDIT_REPORT_PATH: reportPath,
    },
  });
}

function passPayload() {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 1,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 1,
      },
    },
    advisories: {
      1: {
        module_name: 'example-package',
        severity: 'low',
        patched_versions: '>=1.0.1',
        github_advisory_id: 'GHSA-test-pass',
        findings: [{ version: '1.0.0', paths: ['root>example-package'] }],
      },
    },
  };
}

function policyFailurePayload() {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 1,
        critical: 0,
        total: 1,
      },
    },
    advisories: {
      1: {
        module_name: 'example-package',
        severity: 'high',
        patched_versions: '>=2.0.0',
        github_advisory_id: 'GHSA-test-policy',
        findings: [{ version: '1.0.0', paths: ['root>example-package'] }],
      },
    },
  };
}

function scannerFailurePayload() {
  return {
    bad: 'shape',
    token: 'sensitiveTokenShouldNotLeak',
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('security audit script report persistence', () => {
  it('writes the audit report when the destination is valid', () => {
    const tempDirectory = createTempDirectory();
    const fixturePath = writeFixture(passPayload());
    const reportPath = join(tempDirectory, 'audit-report.json');

    const result = runAuditScript(fixturePath, reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[security:audit] source=fixture outcome=pass');
    expect(result.stdout).toContain(`[security:audit] wrote audit report to ${reportPath}`);
    expect(result.stderr).toContain('[security:audit] source=fixture advisory=GHSA-test-pass');
    expect(result.stderr).not.toContain('[security:audit] unable to write audit report to');
    expect(readFileSync(reportPath, 'utf8')).toContain('example-package');
  });

  it('warns and still passes when report persistence fails for a passing audit', () => {
    const fixturePath = writeFixture(passPayload());
    const reportPath = join(createTempDirectory(), 'missing', 'audit-report.json');

    const result = runAuditScript(fixturePath, reportPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[security:audit] source=fixture outcome=pass');
    expect(result.stderr).toContain(
      `[security:audit] unable to write audit report to ${reportPath}`
    );
    expect(result.stderr).toMatch(/ENOENT|no such file or directory/i);
    expect(result.stderr).not.toContain('sensitiveTokenShouldNotLeak');
  });

  it('keeps policy failures as exit 1 when report persistence fails', () => {
    const fixturePath = writeFixture(policyFailurePayload());
    const reportPath = join(createTempDirectory(), 'missing', 'audit-report.json');

    const result = runAuditScript(fixturePath, reportPath);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('[security:audit] source=fixture outcome=policy-failure');
    expect(result.stderr).toContain(
      `[security:audit] unable to write audit report to ${reportPath}`
    );
  });

  it('keeps scanner failures as exit 2 when report persistence fails', () => {
    const fixturePath = writeFixture(scannerFailurePayload());
    const reportPath = join(createTempDirectory(), 'missing', 'audit-report.json');

    const result = runAuditScript(fixturePath, reportPath);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      '[security:audit] scanner failure (fixture): audit payload is missing metadata block'
    );
    expect(result.stderr).toContain(
      `[security:audit] unable to write audit report to ${reportPath}`
    );
    expect(result.stderr).not.toContain('sensitiveTokenShouldNotLeak');
  });
});
