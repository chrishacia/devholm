#!/usr/bin/env node

const baseUrl = (process.env.TARGET_URL || 'http://localhost:3000').replace(/\/$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 8000);

async function fetchWithTimeout(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function check(path, okStatuses) {
  try {
    const response = await fetchWithTimeout(path);
    const ok = okStatuses.includes(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${path} -> ${response.status}`);
    return ok;
  } catch (error) {
    console.log(`FAIL ${path} -> ${error instanceof Error ? error.message : 'request failed'}`);
    return false;
  }
}

async function main() {
  console.log(`Running smoke checks against ${baseUrl}`);

  const checks = [
    check('/api/health', [200, 503]),
    check('/api/health?deep=1', [200, 503]),
    check('/admin/login', [200]),
    check('/admin/users', [200, 307, 302]),
    check('/api/auth/config', [200]),
  ];

  const results = await Promise.all(checks);
  const failed = results.filter((value) => !value).length;

  if (failed > 0) {
    console.error(`Smoke checks failed: ${failed}/${results.length}`);
    process.exit(1);
  }

  console.log(`Smoke checks passed: ${results.length}/${results.length}`);
}

void main();
