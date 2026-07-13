import process from 'node:process';
import * as childProcess from 'node:child_process';
import type { NextRequest } from 'next/server';
import type { ExtensionHelpers } from '@core/types/extensions.server';
import { checksumManifest } from '@core/db/plugin-lifecycle';
import {
  childToParentMessageSchema,
  MAX_ISOLATED_RESPONSE_BODY_BYTES,
  parentToChildMessageSchema,
} from '@core/lib/plugin-isolation-protocol';
import { getBundledPluginManifests } from '@core/lib/plugin-registry.server';
import { apiExtensions } from '@user/extensions/api';
import { publicRouteExtensions } from '@user/extensions/public-routes';

const WORKER_PID = process.pid;

const DISALLOWED_LIFECYCLE_ENV_KEYS = [
  'DATABASE_URL',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSSLMODE',
  'PHASE2_TEST_DATABASE_URL',
] as const;

const helperProxy: ExtensionHelpers = {
  auth: (() => {
    throw new Error('isolated runtime does not expose auth helper directly');
  }) as ExtensionHelpers['auth'],
  getDb: (() => {
    throw new Error('isolated runtime does not expose database helper directly');
  }) as ExtensionHelpers['getDb'],
  verifyAdmin: (() => {
    throw new Error('isolated runtime does not expose verifyAdmin helper directly');
  }) as ExtensionHelpers['verifyAdmin'],
};

function sendMessage(payload: unknown): void {
  if (typeof process.send !== 'function') {
    return;
  }

  const parsed = childToParentMessageSchema.safeParse(payload);
  if (!parsed.success) {
    process.send({
      type: 'worker-error',
      executionId: '00000000-0000-0000-0000-000000000000',
      code: 'worker-protocol-encode-failure',
      message: 'worker attempted to send a malformed protocol message',
      pid: WORKER_PID,
    });
    return;
  }

  process.send(parsed.data);
}

function buildRequestEnvelope(input: {
  url: string;
  method: string;
  headers: [string, string][];
  bodyText?: string;
}): NextRequest {
  return new Request(input.url, {
    method: input.method,
    headers: new Headers(input.headers),
    body: input.bodyText,
  }) as NextRequest;
}

async function serializeResponse(response: Response): Promise<{
  status: number;
  headers: [string, string][];
  bodyText: string;
  truncated: boolean;
}> {
  const headers: [string, string][] = [...response.headers.entries()];
  const bodyText = await response.text();
  const bytes = Buffer.byteLength(bodyText, 'utf8');

  if (bytes <= MAX_ISOLATED_RESPONSE_BODY_BYTES) {
    return {
      status: response.status,
      headers,
      bodyText,
      truncated: false,
    };
  }

  const maxChars = Math.floor(MAX_ISOLATED_RESPONSE_BODY_BYTES * 0.9);
  return {
    status: 500,
    headers,
    bodyText: bodyText.slice(0, maxChars),
    truncated: true,
  };
}

async function executeApi(
  message: Extract<ReturnType<typeof parentToChildMessageSchema.parse>, { type: 'execute-api' }>
) {
  const extension = apiExtensions.find(
    (entry) => entry.pluginId === message.pluginId && entry.path === message.extensionPath
  );
  if (!extension) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'extension-not-found',
      message: `API extension not found for plugin ${message.pluginId} at ${message.extensionPath}`,
      pid: WORKER_PID,
    });
    return;
  }

  const handler = extension.handlers[message.method as keyof typeof extension.handlers];
  if (!handler) {
    const serialized = await serializeResponse(
      Response.json({ error: 'Method not allowed' }, { status: 405 })
    );
    sendMessage({
      type: 'api-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      ...serialized,
    });
    return;
  }

  try {
    const request = buildRequestEnvelope(message.request);
    const response = await handler(request, {
      params: { path: message.pathSegments },
      helpers: helperProxy,
    });
    const serialized = await serializeResponse(response);

    sendMessage({
      type: 'api-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      ...serialized,
    });
  } catch (error) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'api-execution-failure',
      message: error instanceof Error ? error.message : 'unknown isolated API execution error',
      pid: WORKER_PID,
    });
  }
}

async function executePublicRouteMatch(
  message: Extract<
    ReturnType<typeof parentToChildMessageSchema.parse>,
    { type: 'execute-public-route-match' }
  >
) {
  const extension = publicRouteExtensions.find(
    (entry) => entry.pluginId === message.pluginId && entry.id === message.extensionId
  );
  if (!extension) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'extension-not-found',
      message: `Public-route extension not found for plugin ${message.pluginId} with id ${message.extensionId}`,
      pid: WORKER_PID,
    });
    return;
  }

  try {
    const request = buildRequestEnvelope(message.request);
    const match = await extension.match(message.pathname, request, {
      reservedRoutes: new Set(),
      settings: {
        get: async () => null,
        getMany: async () => ({}),
      },
    });

    sendMessage({
      type: 'public-route-match-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      matched: match !== null && match !== undefined,
      match: match ?? undefined,
    });
  } catch (error) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'public-route-match-failure',
      message: error instanceof Error ? error.message : 'unknown isolated public-route match error',
      pid: WORKER_PID,
    });
  }
}

async function executePublicRouteHandle(
  message: Extract<
    ReturnType<typeof parentToChildMessageSchema.parse>,
    { type: 'execute-public-route-handle' }
  >
) {
  const extension = publicRouteExtensions.find(
    (entry) => entry.pluginId === message.pluginId && entry.id === message.extensionId
  );
  if (!extension) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'extension-not-found',
      message: `Public-route extension not found for plugin ${message.pluginId} with id ${message.extensionId}`,
      pid: WORKER_PID,
    });
    return;
  }

  try {
    const request = buildRequestEnvelope(message.request);
    const response = await extension.handle(message.match, request, helperProxy);
    const serialized = await serializeResponse(response);

    sendMessage({
      type: 'public-route-handle-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      ...serialized,
    });
  } catch (error) {
    sendMessage({
      type: 'worker-error',
      executionId: message.executionId,
      code: 'public-route-handle-failure',
      message:
        error instanceof Error
          ? error.message
          : 'unknown isolated public-route handle execution error',
      pid: WORKER_PID,
    });
  }
}

async function executeProbeEnv(
  message: Extract<ReturnType<typeof parentToChildMessageSchema.parse>, { type: 'test-probe-env' }>
) {
  const values = Object.fromEntries(message.keys.map((key) => [key, process.env[key] ?? null]));

  sendMessage({
    type: 'test-probe-env-result',
    executionId: message.executionId,
    pid: WORKER_PID,
    values,
  });
}

function withBlockedChildProcessApis<T>(work: () => Promise<T>): Promise<T> {
  const blocked = () => {
    throw new Error('lifecycle hooks cannot invoke child_process APIs in isolated runtime');
  };

  const originalExec = childProcess.exec;
  const originalExecFile = childProcess.execFile;
  const originalFork = childProcess.fork;
  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  const originalExecFileSync = childProcess.execFileSync;
  const originalExecSync = childProcess.execSync;

  Object.assign(childProcess, {
    exec: blocked,
    execFile: blocked,
    fork: blocked,
    spawn: blocked,
    spawnSync: blocked,
    execFileSync: blocked,
    execSync: blocked,
  });

  return work().finally(() => {
    Object.assign(childProcess, {
      exec: originalExec,
      execFile: originalExecFile,
      fork: originalFork,
      spawn: originalSpawn,
      spawnSync: originalSpawnSync,
      execFileSync: originalExecFileSync,
      execSync: originalExecSync,
    });
  });
}

async function executeLifecycleHook(
  message: Extract<
    ReturnType<typeof parentToChildMessageSchema.parse>,
    { type: 'execute-lifecycle-hook' }
  >
) {
  for (const key of DISALLOWED_LIFECYCLE_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      sendMessage({
        type: 'lifecycle-hook-result',
        executionId: message.executionId,
        pid: WORKER_PID,
        pluginId: message.pluginId,
        hookName: message.hookName,
        operationId: message.operationId,
        hookExecutionId: message.hookExecutionId,
        artifactIdentity: message.artifactIdentity,
        status: 'blocked',
        message: 'lifecycle worker received forbidden database credential environment',
      });
      return;
    }
  }

  const manifest = getBundledPluginManifests().find((entry) => entry.id === message.pluginId);
  if (!manifest) {
    sendMessage({
      type: 'lifecycle-hook-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      pluginId: message.pluginId,
      hookName: message.hookName,
      operationId: message.operationId,
      hookExecutionId: message.hookExecutionId,
      artifactIdentity: message.artifactIdentity,
      status: 'blocked',
      message: `Plugin manifest not found for ${message.pluginId}`,
    });
    return;
  }

  const expectedArtifactIdentity = `bundled:${manifest.id}@${manifest.version}:${checksumManifest(manifest)}`;
  if (message.artifactIdentity !== expectedArtifactIdentity) {
    sendMessage({
      type: 'lifecycle-hook-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      pluginId: message.pluginId,
      hookName: message.hookName,
      operationId: message.operationId,
      hookExecutionId: message.hookExecutionId,
      artifactIdentity: message.artifactIdentity,
      status: 'blocked',
      message: 'Lifecycle artifact identity mismatch',
    });
    return;
  }

  const hook = manifest.lifecycle?.[message.hookName];
  if (!hook) {
    sendMessage({
      type: 'lifecycle-hook-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      pluginId: message.pluginId,
      hookName: message.hookName,
      operationId: message.operationId,
      hookExecutionId: message.hookExecutionId,
      artifactIdentity: message.artifactIdentity,
      status: 'blocked',
      message: `Lifecycle hook ${message.hookName} is not declared`,
    });
    return;
  }

  try {
    await withBlockedChildProcessApis(async () => {
      await Promise.resolve(hook(message.context));
    });

    sendMessage({
      type: 'lifecycle-hook-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      pluginId: message.pluginId,
      hookName: message.hookName,
      operationId: message.operationId,
      hookExecutionId: message.hookExecutionId,
      artifactIdentity: message.artifactIdentity,
      status: 'succeeded',
    });
  } catch (error) {
    sendMessage({
      type: 'lifecycle-hook-result',
      executionId: message.executionId,
      pid: WORKER_PID,
      pluginId: message.pluginId,
      hookName: message.hookName,
      operationId: message.operationId,
      hookExecutionId: message.hookExecutionId,
      artifactIdentity: message.artifactIdentity,
      status: 'failed',
      message: error instanceof Error ? error.message : 'unknown isolated lifecycle hook error',
    });
  }
}

process.on('message', async (rawMessage: unknown) => {
  const parsed = parentToChildMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    sendMessage({
      type: 'worker-error',
      executionId: '00000000-0000-0000-0000-000000000000',
      code: 'worker-protocol-parse-failure',
      message: 'worker received malformed parent message',
      pid: WORKER_PID,
    });
    return;
  }

  const message = parsed.data;
  switch (message.type) {
    case 'execute-api':
      await executeApi(message);
      return;
    case 'execute-public-route-match':
      await executePublicRouteMatch(message);
      return;
    case 'execute-public-route-handle':
      await executePublicRouteHandle(message);
      return;
    case 'execute-lifecycle-hook':
      await executeLifecycleHook(message);
      return;
    case 'test-probe-env':
      await executeProbeEnv(message);
      return;
  }
});

sendMessage({
  type: 'worker-ready',
  pid: WORKER_PID,
});
