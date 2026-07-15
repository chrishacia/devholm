#!/usr/bin/env tsx

import fs from 'fs';
import { spawnSync } from 'child_process';
import {
  evaluateSecurityAuditPayload,
  type SecurityAuditEvaluation,
} from '../src/core/lib/security-audit-policy';

const AUDIT_FIXTURE_ENV = 'DEVHOLM_SECURITY_AUDIT_FIXTURE';

function loadAuditPayloadFromFixture(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audit fixture file does not exist: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function runPnpmAuditJson(): {
  payload: unknown;
  exitCode: number;
  stderr: string;
} {
  const result = spawnSync('pnpm', ['audit', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Failed to execute pnpm audit: ${result.error.message}`);
  }

  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (!stdout) {
    throw new Error(`pnpm audit produced empty JSON output${stderr ? ` (stderr: ${stderr})` : ''}`);
  }

  return {
    payload: JSON.parse(stdout),
    exitCode: result.status ?? 1,
    stderr,
  };
}

function printSummary(evaluation: SecurityAuditEvaluation, source: 'fixture' | 'npm-audit'): void {
  if (evaluation.outcome === 'scanner-failure') {
    console.error(`[security:audit] scanner failure (${source}): ${evaluation.reason}`);
    return;
  }

  const { counts } = evaluation;
  console.log(
    `[security:audit] source=${source} outcome=${evaluation.outcome} total=${counts.total} info=${counts.info} low=${counts.low} moderate=${counts.moderate} high=${counts.high} critical=${counts.critical}`
  );
}

function main(): void {
  const fixturePath = process.env[AUDIT_FIXTURE_ENV];
  const source = fixturePath ? 'fixture' : 'npm-audit';

  let payload: unknown;
  let auditExitCode = 0;
  let auditStderr = '';

  try {
    if (fixturePath) {
      payload = loadAuditPayloadFromFixture(fixturePath);
    } else {
      const runtime = runPnpmAuditJson();
      payload = runtime.payload;
      auditExitCode = runtime.exitCode;
      auditStderr = runtime.stderr;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[security:audit] scanner failure (${source}): ${message}`);
    process.exit(2);
  }

  const evaluation = evaluateSecurityAuditPayload(payload);
  printSummary(evaluation, source);

  if (evaluation.outcome === 'scanner-failure') {
    process.exit(2);
  }

  if (!fixturePath && auditExitCode !== 0 && evaluation.outcome === 'pass') {
    console.warn(
      `[security:audit] pnpm audit exit=${auditExitCode} but policy passed (no high/critical vulnerabilities).`
    );
    if (auditStderr) {
      console.warn(`[security:audit] pnpm audit stderr: ${auditStderr}`);
    }
  }

  if (evaluation.outcome === 'policy-failure') {
    process.exit(1);
  }

  process.exit(0);
}

main();
