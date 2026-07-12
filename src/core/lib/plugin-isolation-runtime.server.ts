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
  MAX_ISOLATED_REQUEST_BODY_BYTES,
  parentToChildMessageSchema,
  type ParentToChildMessage,
} from '@core/lib/plugin-isolation-protocol';

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
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
] as const;

const WORKER_PATH = path.join(process.cwd(), 'src/core/lib/plugin-isolation-worker.ts');

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

async function runWorkerMessage(message: ParentToChildMessage): Promise<ChildToParentMessage> {
  if (!existsSync(WORKER_PATH)) {
    throw new Error('plugin isolation worker file is missing');
  }

  const parsedMessage = parentToChildMessageSchema.parse(message);
  const timeoutMs = DEFAULT_ISOLATED_EXECUTION_TIMEOUT_MS;

  return new Promise<ChildToParentMessage>((resolve, reject) => {
    const child = fork(WORKER_PATH, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: createChildEnv(),
      execArgv: ['--import', 'tsx'],
    });

    let settled = false;
    let timeout: NodeJS.Timeout | null = null;
    let hardKillTimeout: NodeJS.Timeout | null = null;

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
      finish(() => {
        reject(
          new Error(
            `isolated worker exited before response (code=${String(code)}, signal=${String(signal)})`
          )
        );
      });
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
