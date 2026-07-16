#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EXPECTED_ERROR = 'Service Unavailable';
export const EXPECTED_MESSAGE = 'Route resolution service temporarily unavailable';

export function isJsonCompatibleContentType(contentType) {
  if (typeof contentType !== 'string') {
    return false;
  }

  return /^application\/json\s*(;.*)?$/i.test(contentType.trim());
}

export function parseJsonObject(bodyRaw) {
  if (typeof bodyRaw !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(bodyRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function verifyPluginProbeResponse({ status, contentType, bodyRaw }) {
  if ([200, 301, 302, 307, 308, 404].includes(status)) {
    return true;
  }

  if (status !== 503) {
    return false;
  }

  if (!isJsonCompatibleContentType(contentType)) {
    return false;
  }

  const payload = parseJsonObject(bodyRaw);
  if (!payload) {
    return false;
  }

  return payload.error === EXPECTED_ERROR && payload.message === EXPECTED_MESSAGE;
}

function parseArgs(argv) {
  const parsed = {
    status: undefined,
    contentType: '',
    bodyFile: '',
    body: undefined,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      continue;
    }

    if (key === '--status') {
      parsed.status = Number.parseInt(next, 10);
      i += 1;
    } else if (key === '--content-type') {
      parsed.contentType = next;
      i += 1;
    } else if (key === '--body-file') {
      parsed.bodyFile = next;
      i += 1;
    } else if (key === '--body') {
      parsed.body = next;
      i += 1;
    }
  }

  return parsed;
}

function runCli() {
  const args = parseArgs(process.argv);

  if (!Number.isFinite(args.status)) {
    console.error('Missing or invalid --status');
    process.exit(2);
  }

  let bodyRaw = '';
  if (typeof args.body === 'string') {
    bodyRaw = args.body;
  } else if (args.bodyFile) {
    try {
      bodyRaw = fs.readFileSync(args.bodyFile, 'utf8');
    } catch {
      bodyRaw = '';
    }
  }

  const ok = verifyPluginProbeResponse({
    status: args.status,
    contentType: args.contentType,
    bodyRaw,
  });

  if (!ok) {
    process.exit(1);
  }

  process.exit(0);
}

const currentModulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';

if (invokedPath && fs.realpathSync(currentModulePath) === invokedPath) {
  runCli();
}
