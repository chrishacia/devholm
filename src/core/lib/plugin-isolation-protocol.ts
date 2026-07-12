import { z } from 'zod';

export const MAX_ISOLATED_REQUEST_BODY_BYTES = 256 * 1024;
export const MAX_ISOLATED_RESPONSE_BODY_BYTES = 512 * 1024;
export const DEFAULT_ISOLATED_EXECUTION_TIMEOUT_MS = 5000;

const headerTupleSchema = z.tuple([z.string(), z.string()]);

export const isolatedRequestEnvelopeSchema = z.object({
  url: z.string().url(),
  method: z.string().min(1),
  headers: z.array(headerTupleSchema),
  bodyText: z.string().optional(),
});

const executeApiMessageSchema = z.object({
  type: z.literal('execute-api'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionPath: z.string().min(1),
  method: z.string().min(1),
  pathSegments: z.array(z.string()),
  request: isolatedRequestEnvelopeSchema,
});

const executePublicRouteMatchMessageSchema = z.object({
  type: z.literal('execute-public-route-match'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionId: z.string().min(1),
  pathname: z.string().min(1),
  request: isolatedRequestEnvelopeSchema,
});

const executePublicRouteHandleMessageSchema = z.object({
  type: z.literal('execute-public-route-handle'),
  executionId: z.string().uuid(),
  pluginId: z.string().min(1),
  extensionId: z.string().min(1),
  request: isolatedRequestEnvelopeSchema,
  match: z.unknown(),
});

const testProbeEnvMessageSchema = z.object({
  type: z.literal('test-probe-env'),
  executionId: z.string().uuid(),
  keys: z.array(z.string().min(1)).max(32),
});

export const parentToChildMessageSchema = z.discriminatedUnion('type', [
  executeApiMessageSchema,
  executePublicRouteMatchMessageSchema,
  executePublicRouteHandleMessageSchema,
  testProbeEnvMessageSchema,
]);

export type ParentToChildMessage = z.infer<typeof parentToChildMessageSchema>;

const workerReadyMessageSchema = z.object({
  type: z.literal('worker-ready'),
  pid: z.number().int().positive(),
});

const workerErrorMessageSchema = z.object({
  type: z.literal('worker-error'),
  executionId: z.string().uuid(),
  code: z.string().min(1),
  message: z.string(),
  pid: z.number().int().positive(),
});

const apiResultMessageSchema = z.object({
  type: z.literal('api-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  status: z.number().int(),
  headers: z.array(headerTupleSchema),
  bodyText: z.string(),
  truncated: z.boolean(),
});

const publicRouteMatchResultSchema = z.object({
  type: z.literal('public-route-match-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  matched: z.boolean(),
  match: z.unknown().optional(),
});

const publicRouteHandleResultSchema = z.object({
  type: z.literal('public-route-handle-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  status: z.number().int(),
  headers: z.array(headerTupleSchema),
  bodyText: z.string(),
  truncated: z.boolean(),
});

const testProbeEnvResultSchema = z.object({
  type: z.literal('test-probe-env-result'),
  executionId: z.string().uuid(),
  pid: z.number().int().positive(),
  values: z.record(z.string(), z.string().nullable()),
});

export const childToParentMessageSchema = z.discriminatedUnion('type', [
  workerReadyMessageSchema,
  workerErrorMessageSchema,
  apiResultMessageSchema,
  publicRouteMatchResultSchema,
  publicRouteHandleResultSchema,
  testProbeEnvResultSchema,
]);

export type ChildToParentMessage = z.infer<typeof childToParentMessageSchema>;
