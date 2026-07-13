import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import type { PublicRouteExtension } from '@core/types/extensions.server';
import type { ApiExtensionMethod } from '@core/types/extensions.server';
import {
  childToParentMessageSchema,
  DEFAULT_ISOLATED_EXECUTION_TIMEOUT_MS,
  type ChildToParentMessage,
  type MigrationExecutionPlan,
  MAX_ISOLATED_REQUEST_BODY_BYTES,
  type ParentToChildMessage,
  parentToChildMessageSchema,
} from '@core/lib/plugin-isolation-protocol';
import type { PluginLifecycleContext } from '@core/types/plugins';

export interface PluginIsolationExecutionMeta {
  executionId: string;
  childPid: number;
}

interface IsolatedResponse {
  response: Response;
  meta: PluginIsolationExecutionMeta;
}

const ALLOWED_CHILD_ENV_KEYS = [
  'NODE_ENV',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'AUTH_URL',
  'NEXTAUTH_URL',
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

const ALLOWED_LIFECYCLE_ENV_KEYS = [
  'NODE_ENV',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'AUTH_URL',
  'NEXTAUTH_URL',
] as const;

const WORKER_PATH = path.join(process.cwd(), 'src/core/lib/plugin-isolation-worker.ts');
const MIGRATION_WORKER_PATH = path.join(
  process.cwd(),
  'src/core/lib/plugin-migration-isolation-worker.ts'
);

function createChildEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  };

  for (const key of ALLOWED_CHILD_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env as NodeJS.ProcessEnv;
}

function createMinimalChildEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  };
}

function createLifecycleChildEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  };

  for (const key of ALLOWED_LIFECYCLE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env as NodeJS.ProcessEnv;
}

function createChildEnvByProfile(profile: 'default' | 'minimal' | 'lifecycle'): NodeJS.ProcessEnv {
  if (profile === 'minimal') {
    return createMinimalChildEnv();
  }

  if (profile === 'lifecycle') {
    return createLifecycleChildEnv();
  }

  return createChildEnv();
}

async function serializeRequest(request: NextRequest): Promise<{
  url: string;
  method: string;
  headers: [string, string][];
  bodyText?: string;
}> {
  const url =
    typeof request.url === 'string' && request.url.length > 0
      ? request.url
      : `http://localhost:3000${request.nextUrl?.pathname ?? '/'}`;

  let headers: [string, string][] = [];
  if (request.headers instanceof Headers) {
    headers = [...request.headers.entries()];
  } else if (request.headers) {
    try {
      headers = [...new Headers(request.headers as HeadersInit).entries()];
    } catch {
      headers = [];
    }
  }

  const method = (request.method ?? 'GET').toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);

  if (!hasBody) {
    return { url, method, headers };
  }

  const bodyText =
    typeof request.clone === 'function'
      ? await request.clone().text()
      : (request as Request).body
        ? await (request as Request).text()
        : '';
  const bodyBytes = Buffer.byteLength(bodyText, 'utf8');
  if (bodyBytes > MAX_ISOLATED_REQUEST_BODY_BYTES) {
    throw new Error('isolated request body exceeded maximum allowed size');
  }

  return {
    url,
    method,
    headers,
    bodyText,
  };
}

async function runWorkerMessage(
  message: ParentToChildMessage,
  options?: {
    timeoutMs?: number;
    workerPath?: string;
    envProfile?: 'default' | 'minimal' | 'lifecycle';
  }
): Promise<ChildToParentMessage> {
  const workerPath = options?.workerPath ?? WORKER_PATH;
  if (!existsSync(workerPath)) {
    throw new Error('plugin isolation worker file is missing');
  }

  const parsedMessage = parentToChildMessageSchema.parse(message);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ISOLATED_EXECUTION_TIMEOUT_MS;

  return new Promise<ChildToParentMessage>((resolve, reject) => {
    const child = fork(workerPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: createChildEnvByProfile(options?.envProfile ?? 'default'),
      execArgv: ['--import', 'tsx'],
    });

    let settled = false;
    let timeout: NodeJS.Timeout | null = null;
    let hardKillTimeout: NodeJS.Timeout | null = null;
    const stderrChunks: string[] = [];

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (hardKillTimeout) {
        clearTimeout(hardKillTimeout);
      }
    };

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    };

    const terminateChild = () => {
      if (child.killed) {
        return;
      }
      child.kill('SIGTERM');
      hardKillTimeout = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 250);
    };

    timeout = setTimeout(() => {
      terminateChild();
      finish(() => {
        reject(new Error('isolated plugin execution timed out'));
      });
    }, timeoutMs);

    child.on('error', (error) => {
      terminateChild();
      finish(() => reject(error));
    });

    child.on('exit', (code, signal) => {
      if (settled) {
        return;
      }
      const stderrText = stderrChunks.join('').trim();
      finish(() => {
        reject(
          new Error(
            `isolated worker exited before response (code=${String(code)}, signal=${String(signal)})${stderrText ? ` stderr=${stderrText}` : ''}`
          )
        );
      });
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);
    });

    child.on('message', (rawMessage: unknown) => {
      const parsed = childToParentMessageSchema.safeParse(rawMessage);
      if (!parsed.success) {
        terminateChild();
        finish(() => reject(new Error('received malformed message from isolated worker')));
        return;
      }

      const event = parsed.data;
      if (event.type === 'worker-ready') {
        child.send(parsedMessage);
        return;
      }

      terminateChild();
      finish(() => resolve(event));
    });
  });
}

export async function runIsolatedApiExtension(params: {
  pluginId: string;
  extensionPath: string;
  method: ApiExtensionMethod;
  request: NextRequest;
  pathSegments: string[];
}): Promise<IsolatedResponse> {
  const executionId = randomUUID();
  const request = await serializeRequest(params.request);

  const event = await runWorkerMessage({
    type: 'execute-api',
    executionId,
    pluginId: params.pluginId,
    extensionPath: params.extensionPath,
    method: params.method,
    pathSegments: params.pathSegments,
    request,
  });

  if (event.type === 'worker-error') {
    throw new Error(`isolated API execution failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'api-result') {
    throw new Error('isolated API execution received an unexpected worker response');
  }

  return {
    response: new Response(event.bodyText, {
      status: event.status,
      headers: new Headers(event.headers),
    }),
    meta: {
      executionId,
      childPid: event.pid,
    },
  };
}

export async function runIsolatedPublicRouteMatch(params: {
  pluginId: string;
  extensionId: string;
  pathname: string;
  request: NextRequest;
}): Promise<{
  matched: boolean;
  match: unknown;
  meta: PluginIsolationExecutionMeta;
}> {
  const executionId = randomUUID();
  const request = await serializeRequest(params.request);

  const event = await runWorkerMessage({
    type: 'execute-public-route-match',
    executionId,
    pluginId: params.pluginId,
    extensionId: params.extensionId,
    pathname: params.pathname,
    request,
  });

  if (event.type === 'worker-error') {
    throw new Error(`isolated public-route match failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'public-route-match-result') {
    throw new Error('isolated public-route match received an unexpected worker response');
  }

  return {
    matched: event.matched,
    match: event.match,
    meta: {
      executionId,
      childPid: event.pid,
    },
  };
}

export async function runIsolatedPublicRouteHandle(params: {
  pluginId: string;
  extensionId: string;
  match: unknown;
  request: NextRequest;
}): Promise<IsolatedResponse> {
  const executionId = randomUUID();
  const request = await serializeRequest(params.request);

  const event = await runWorkerMessage({
    type: 'execute-public-route-handle',
    executionId,
    pluginId: params.pluginId,
    extensionId: params.extensionId,
    request,
    match: params.match,
  });

  if (event.type === 'worker-error') {
    throw new Error(`isolated public-route handler failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'public-route-handle-result') {
    throw new Error('isolated public-route handler received an unexpected worker response');
  }

  return {
    response: new Response(event.bodyText, {
      status: event.status,
      headers: new Headers(event.headers),
    }),
    meta: {
      executionId,
      childPid: event.pid,
    },
  };
}

export async function runIsolatedLifecycleHook(params: {
  pluginId: string;
  hookName: 'afterInstall' | 'afterUpgrade' | 'beforeDisable' | 'beforeUninstall' | 'purge';
  operationId: string;
  hookExecutionId: string;
  artifactIdentity: string;
  context: PluginLifecycleContext;
  effectiveCapabilities: string[];
  approvedBrokerOperations: string[];
}): Promise<{
  status: 'succeeded' | 'failed' | 'timed_out' | 'blocked' | 'cancelled';
  message?: string;
  meta: PluginIsolationExecutionMeta;
}> {
  const executionId = randomUUID();

  const event = await runWorkerMessage(
    {
      type: 'execute-lifecycle-hook',
      executionId,
      pluginId: params.pluginId,
      hookName: params.hookName,
      operationId: params.operationId,
      hookExecutionId: params.hookExecutionId,
      artifactIdentity: params.artifactIdentity,
      context: params.context,
      effectiveCapabilities: params.effectiveCapabilities,
      approvedBrokerOperations: params.approvedBrokerOperations,
    },
    {
      envProfile: 'lifecycle',
    }
  );

  if (event.type === 'worker-error') {
    throw new Error(`isolated lifecycle hook execution failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'lifecycle-hook-result') {
    throw new Error('isolated lifecycle hook execution received an unexpected worker response');
  }

  return {
    status: event.status,
    message: event.message,
    meta: {
      executionId,
      childPid: event.pid,
    },
  };
}

export async function testProbeIsolatedEnv(keys: string[]): Promise<Record<string, string | null>> {
  const executionId = randomUUID();
  const event = await runWorkerMessage({
    type: 'test-probe-env',
    executionId,
    keys,
  });

  if (event.type === 'worker-error') {
    throw new Error(`isolated env probe failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'test-probe-env-result') {
    throw new Error('isolated env probe received an unexpected worker response');
  }

  return event.values;
}

export async function runIsolatedMigrationPlan(params: {
  pluginId: string;
  migrationId: string;
  checksum: string;
  artifactIdentity: string;
  direction: 'up' | 'down';
  absolutePath: string;
  sourceVersion: string;
  targetVersion: string;
  timeoutMs?: number;
}): Promise<{
  plan: MigrationExecutionPlan;
  meta: PluginIsolationExecutionMeta;
}> {
  const executionId = randomUUID();

  const event = await runWorkerMessage(
    {
      type: 'execute-migration-plan',
      executionId,
      pluginId: params.pluginId,
      migrationId: params.migrationId,
      checksum: params.checksum,
      artifactIdentity: params.artifactIdentity,
      direction: params.direction,
      absolutePath: params.absolutePath,
      sourceVersion: params.sourceVersion,
      targetVersion: params.targetVersion,
      timeoutMs: params.timeoutMs,
    },
    {
      timeoutMs: params.timeoutMs,
      envProfile: 'minimal',
      workerPath: MIGRATION_WORKER_PATH,
    }
  );

  if (event.type === 'worker-error') {
    throw new Error(`isolated migration planning failed: ${event.code}: ${event.message}`);
  }

  if (event.type !== 'migration-plan-result') {
    throw new Error('isolated migration planning received an unexpected worker response');
  }

  if (event.direction !== params.direction) {
    throw new Error('isolated migration planning direction mismatch');
  }

  return {
    plan: event.plan,
    meta: {
      executionId,
      childPid: event.pid,
    },
  };
}

export function shouldUseIsolatedRuntimeForExtension(input: {
  pluginId?: string;
  accessPolicy?: PublicRouteExtension['accessPolicy'];
}): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.PLUGIN_ISOLATION_ENABLE_IN_TESTS !== 'true') {
    return false;
  }

  if (!input.pluginId) {
    return false;
  }

  return input.accessPolicy?.runtimeOwner === 'plugin-extension';
}
