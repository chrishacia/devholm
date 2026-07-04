// @vitest-environment node

import {
  defineAccessDeclaration,
  defineNormalizedPolicySubject,
  permissionId,
  policyEvaluatorId,
  policyResolverId,
  type AccessDeclaration,
  type NormalizedPolicySubject,
  type PolicyResult,
  type PolicyResultKind,
} from '@devholm/sdk';
import { createPolicyRegistry } from '@devholm/sdk/server';
import { describe, expect, it } from 'vitest';

const orderedResultKinds = [
  'allow',
  'unauthenticated',
  'forbidden',
  'not-found',
  'policy-error',
] as const satisfies readonly PolicyResultKind[];

function createSubject(overrides: Partial<NormalizedPolicySubject> = {}): NormalizedPolicySubject {
  return defineNormalizedPolicySubject({
    authenticated: false,
    roles: [],
    permissions: [],
    ...overrides,
  });
}

function policyResult(kind: PolicyResultKind): PolicyResult {
  if (kind === 'policy-error') {
    return {
      kind,
      error: {
        code: 'composition-failed',
      },
    };
  }

  return { kind };
}

function leafDeclaration(kind: PolicyResultKind): AccessDeclaration {
  return defineAccessDeclaration({
    kind: 'custom',
    evaluatorId: policyEvaluatorId(`framework:evaluator:${kind}`),
  });
}

function createMatrixRegistry() {
  const registry = createPolicyRegistry();

  for (const kind of orderedResultKinds) {
    registry.registerEvaluator({
      id: policyEvaluatorId(`framework:evaluator:${kind}`),
      owner: 'framework',
      evaluate: () => policyResult(kind),
    });
  }

  return registry;
}

function createFailureRegistry() {
  const registry = createPolicyRegistry();

  registry.registerEvaluator({
    id: policyEvaluatorId('framework:evaluator:throws'),
    owner: 'framework',
    evaluate: () => {
      throw new Error('secret evaluator failure');
    },
  });

  registry.registerEvaluator({
    id: policyEvaluatorId('framework:evaluator:rejects'),
    owner: 'framework',
    evaluate: async () => Promise.reject(new Error('secret async evaluator failure')),
  });

  registry.registerResolver({
    id: policyResolverId('site:resolver:throws'),
    owner: 'site',
    resolve: () => {
      throw new Error('secret resolver failure');
    },
  });

  registry.registerResolver({
    id: policyResolverId('site:resolver:rejects'),
    owner: 'site',
    resolve: async () => Promise.reject(new Error('secret async resolver failure')),
  });

  return registry;
}

function makeOwnershipDeclaration(resolverName: string): AccessDeclaration {
  return defineAccessDeclaration({
    kind: 'ownership',
    resolverId: policyResolverId(`site:resolver:${resolverName}`),
  });
}

function makeCustomDeclaration(evaluatorName: string): AccessDeclaration {
  return defineAccessDeclaration({
    kind: 'custom',
    evaluatorId: policyEvaluatorId(`framework:evaluator:${evaluatorName}`),
  });
}

function expectedAllOf(left: PolicyResultKind, right: PolicyResultKind): PolicyResultKind {
  if (left === 'policy-error' || right === 'policy-error') {
    return 'policy-error';
  }

  const precedence: Record<Exclude<PolicyResultKind, 'policy-error'>, number> = {
    allow: 0,
    unauthenticated: 1,
    'not-found': 2,
    forbidden: 3,
  };

  return precedence[left] >= precedence[right] ? left : right;
}

function expectedAnyOf(left: PolicyResultKind, right: PolicyResultKind): PolicyResultKind {
  if (left === 'policy-error' || right === 'policy-error') {
    return 'policy-error';
  }

  if (left === 'allow' || right === 'allow') {
    return 'allow';
  }

  const precedence: Record<'unauthenticated' | 'not-found' | 'forbidden', number> = {
    unauthenticated: 0,
    'not-found': 1,
    forbidden: 2,
  };

  return precedence[left as 'unauthenticated' | 'not-found' | 'forbidden'] >=
    precedence[right as 'unauthenticated' | 'not-found' | 'forbidden']
    ? left
    : right;
}

describe('SDK Stage 2 policy engine', () => {
  it('evaluates the built-in declarations deterministically', async () => {
    const registry = createPolicyRegistry();

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'everyone' }), {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'anonymous-only' }), {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'anonymous-only' }), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'authenticated' }), {
        subject: createSubject(),
      })
    ).resolves.toMatchObject({ kind: 'unauthenticated' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'authenticated' }), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'editor'] }),
        {
          subject: createSubject({ authenticated: true, roles: ['editor'] }),
        }
      )
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'editor'] }),
        {
          subject: createSubject({ authenticated: true, roles: ['viewer'] }),
        }
      )
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'permission-any',
          permissions: [permissionId('posts.edit')],
        }),
        {
          subject: createSubject({
            authenticated: true,
            permissions: [permissionId('posts.edit')],
          }),
        }
      )
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'permission-any',
          permissions: [permissionId('posts.edit')],
        }),
        {
          subject: createSubject({
            authenticated: true,
            permissions: [permissionId('posts.read')],
          }),
        }
      )
    ).resolves.toEqual({ kind: 'forbidden' });
  });

  it('rejects empty role and permission declarations during validation and evaluation', async () => {
    const registry = createPolicyRegistry();

    const emptyRoles = defineAccessDeclaration({ kind: 'role-any', roles: [] });
    const emptyPermissions = defineAccessDeclaration({ kind: 'permission-any', permissions: [] });

    expect(registry.validateDeclaration(emptyRoles)).toEqual({
      valid: false,
      issues: [
        {
          code: 'invalid-declaration',
          path: '$',
          declarationKind: 'role-any',
        },
      ],
    });

    expect(registry.validateDeclaration(emptyPermissions)).toEqual({
      valid: false,
      issues: [
        {
          code: 'invalid-declaration',
          path: '$',
          declarationKind: 'permission-any',
        },
      ],
    });

    await expect(
      registry.evaluateDeclaration(emptyRoles, {
        subject: createSubject(),
      })
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'invalid-declaration',
      },
    });

    await expect(
      registry.evaluateDeclaration(emptyPermissions, {
        subject: createSubject(),
      })
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'invalid-declaration',
      },
    });
  });

  it('evaluates ownership and custom evaluator outcomes without auth wiring', async () => {
    const registry = createPolicyRegistry();

    registry.registerResolver({
      id: policyResolverId('site:resolver:resource-owner'),
      owner: 'site',
      resolve: ({ resource }) => {
        const ownerId = resource?.ownerId;

        return typeof ownerId === 'string' ? ownerId : null;
      },
    });

    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:allow'),
      owner: 'framework',
      evaluate: () => ({ kind: 'allow' }),
    });

    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:forbidden'),
      owner: 'framework',
      evaluate: () => ({
        kind: 'forbidden',
      }),
    });

    await expect(
      registry.evaluateDeclaration(makeOwnershipDeclaration('resource-owner'), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
        resource: { ownerId: 'user-1' },
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(makeOwnershipDeclaration('resource-owner'), {
        subject: createSubject({ authenticated: true, subjectId: 'user-2' }),
        resource: { ownerId: 'user-1' },
      })
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(makeOwnershipDeclaration('resource-owner'), {
        subject: createSubject({ authenticated: false }),
        resource: { ownerId: 'user-1' },
      })
    ).resolves.toEqual({ kind: 'unauthenticated' });

    await expect(
      registry.evaluateDeclaration(makeOwnershipDeclaration('resource-owner'), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
        resource: {},
      })
    ).resolves.toEqual({ kind: 'not-found' });

    await expect(
      registry.evaluateDeclaration(makeCustomDeclaration('allow'), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(makeCustomDeclaration('forbidden'), {
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'forbidden' });
  });

  it('rejects malformed identifiers, owner mismatches, and duplicate registrations', () => {
    const registry = createPolicyRegistry();

    expect(() =>
      registry.registerEvaluator({
        id: policyEvaluatorId('bad-id'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      })
    ).toThrow(/Invalid evaluator identifier/);

    expect(() =>
      registry.registerEvaluator({
        id: policyEvaluatorId('site:evaluator:demo'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      })
    ).toThrow(/owner mismatch/);

    expect(() =>
      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:other:evaluator:demo'),
        owner: 'plugin:url-shortener',
        evaluate: () => ({ kind: 'allow' }),
      })
    ).toThrow(/owner mismatch/);

    registry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:demo'),
      owner: 'framework',
      evaluate: () => ({ kind: 'allow' }),
    });

    expect(() =>
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:demo'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      })
    ).toThrow(/Duplicate evaluator registration id/);

    expect(() =>
      registry.registerResolver({
        id: policyResolverId('bad-id'),
        owner: 'site',
        resolve: () => 'user-1',
      })
    ).toThrow(/Invalid resolver identifier/);

    expect(() =>
      registry.registerResolver({
        id: policyResolverId('framework:resolver:demo'),
        owner: 'site',
        resolve: () => 'user-1',
      })
    ).toThrow(/owner mismatch/);

    registry.registerResolver({
      id: policyResolverId('site:resolver:demo'),
      owner: 'site',
      resolve: () => 'user-1',
    });

    expect(() =>
      registry.registerResolver({
        id: policyResolverId('site:resolver:demo'),
        owner: 'site',
        resolve: () => 'user-1',
      })
    ).toThrow(/Duplicate resolver registration id/);
  });

  it('reports unknown references through validation and runtime policy-error results', async () => {
    const registry = createPolicyRegistry();

    const missingEvaluator = makeCustomDeclaration('missing');
    const missingResolver = makeOwnershipDeclaration('missing');

    expect(registry.validateDeclaration(missingEvaluator)).toEqual({
      valid: false,
      issues: [
        {
          code: 'missing-runtime-reference',
          path: '$',
          referenceId: policyEvaluatorId('framework:evaluator:missing'),
          declarationKind: 'custom',
        },
      ],
    });

    expect(registry.validateDeclaration(missingResolver)).toEqual({
      valid: false,
      issues: [
        {
          code: 'missing-runtime-reference',
          path: '$',
          referenceId: policyResolverId('site:resolver:missing'),
          declarationKind: 'ownership',
        },
      ],
    });

    await expect(
      registry.evaluateDeclaration(missingEvaluator, {
        subject: createSubject({ authenticated: true }),
      })
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'missing-runtime-reference',
      },
    });

    await expect(
      registry.evaluateDeclaration(missingResolver, {
        subject: createSubject({ authenticated: true }),
      })
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'missing-runtime-reference',
      },
    });
  });

  it('keeps registry instances isolated and diagnostics deterministic', () => {
    const firstRegistry = createPolicyRegistry();
    const secondRegistry = createPolicyRegistry();

    firstRegistry.registerEvaluator({
      id: policyEvaluatorId('framework:evaluator:shared'),
      owner: 'framework',
      evaluate: () => ({ kind: 'allow' }),
    });

    const validDeclaration = makeCustomDeclaration('shared');
    const missingDeclaration = makeCustomDeclaration('shared');

    expect(firstRegistry.validateDeclaration(validDeclaration)).toEqual({
      valid: true,
      issues: [],
    });

    expect(secondRegistry.validateDeclaration(missingDeclaration)).toEqual({
      valid: false,
      issues: [
        {
          code: 'missing-runtime-reference',
          path: '$',
          referenceId: policyEvaluatorId('framework:evaluator:shared'),
          declarationKind: 'custom',
        },
      ],
    });

    expect(secondRegistry.validateDeclaration(missingDeclaration)).toEqual(
      secondRegistry.validateDeclaration(missingDeclaration)
    );
  });

  it('evaluates the exhaustive allOf and anyOf matrix for every ordered pair', async () => {
    const registry = createMatrixRegistry();

    for (const left of orderedResultKinds) {
      for (const right of orderedResultKinds) {
        const allOf = defineAccessDeclaration({
          kind: 'allOf',
          policies: [leafDeclaration(left), leafDeclaration(right)],
        });

        const anyOf = defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration(left), leafDeclaration(right)],
        });

        const allOfResult = await registry.evaluateDeclaration(allOf, {
          subject: createSubject(),
        });
        const anyOfResult = await registry.evaluateDeclaration(anyOf, {
          subject: createSubject(),
        });

        expect(allOfResult.kind).toBe(expectedAllOf(left, right));
        expect(anyOfResult.kind).toBe(expectedAnyOf(left, right));

        if (allOfResult.kind === 'policy-error') {
          expect(allOfResult.error.code).toBe('composition-failed');
        }

        if (anyOfResult.kind === 'policy-error') {
          expect(anyOfResult.error.code).toBe('composition-failed');
        }
      }
    }
  });

  it('keeps nested compositions and reordered trees deterministic', async () => {
    const registry = createMatrixRegistry();

    const nestedOne = defineAccessDeclaration({
      kind: 'allOf',
      policies: [
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('allow'), leafDeclaration('forbidden')],
        }),
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('not-found'), leafDeclaration('unauthenticated')],
        }),
      ],
    });

    const nestedEquivalent = defineAccessDeclaration({
      kind: 'allOf',
      policies: [
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('not-found'), leafDeclaration('unauthenticated')],
        }),
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('forbidden'), leafDeclaration('allow')],
        }),
      ],
    });

    await expect(
      registry.evaluateDeclaration(nestedOne, {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'not-found' });

    await expect(
      registry.evaluateDeclaration(nestedEquivalent, {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'not-found' });

    const reorderedLeft = defineAccessDeclaration({
      kind: 'allOf',
      policies: [
        leafDeclaration('allow'),
        leafDeclaration('not-found'),
        leafDeclaration('forbidden'),
      ],
    });

    const reorderedRight = defineAccessDeclaration({
      kind: 'allOf',
      policies: [
        leafDeclaration('forbidden'),
        leafDeclaration('allow'),
        leafDeclaration('not-found'),
      ],
    });

    await expect(
      registry.evaluateDeclaration(reorderedLeft, {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(reorderedRight, {
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'forbidden' });
  });

  it('sanitizes evaluator and resolver failures without leaking raw errors', async () => {
    const registry = createFailureRegistry();

    const thrownEvaluator = makeCustomDeclaration('throws');
    const rejectedEvaluator = makeCustomDeclaration('rejects');

    const thrownResolver = makeOwnershipDeclaration('throws');
    const rejectedResolver = makeOwnershipDeclaration('rejects');

    const thrownEvaluatorResult = await registry.evaluateDeclaration(thrownEvaluator, {
      subject: createSubject({ authenticated: true }),
    });

    const rejectedEvaluatorResult = await registry.evaluateDeclaration(rejectedEvaluator, {
      subject: createSubject({ authenticated: true }),
    });

    const thrownResolverResult = await registry.evaluateDeclaration(thrownResolver, {
      subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      resource: { ownerId: 'user-1' },
    });

    const rejectedResolverResult = await registry.evaluateDeclaration(rejectedResolver, {
      subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      resource: { ownerId: 'user-1' },
    });

    for (const result of [
      thrownEvaluatorResult,
      rejectedEvaluatorResult,
      thrownResolverResult,
      rejectedResolverResult,
    ]) {
      expect(result).toMatchObject({
        kind: 'policy-error',
      });

      if (result.kind === 'policy-error') {
        expect(
          result.error.code === 'evaluator-failed' || result.error.code === 'resolver-failed'
        ).toBe(true);
      }

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('stack');
      expect(serialized).not.toContain('boom');
    }
  });

  it('returns policy-error for invalid empty compositions at runtime and keeps deny precedence stable', async () => {
    const registry = createMatrixRegistry();

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'allOf', policies: [] }), {
        subject: createSubject(),
      })
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'invalid-declaration',
      },
    });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('forbidden'), leafDeclaration('unauthenticated')],
        }),
        {
          subject: createSubject(),
        }
      )
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [leafDeclaration('allow'), leafDeclaration('policy-error')],
        }),
        {
          subject: createSubject(),
        }
      )
    ).resolves.toMatchObject({
      kind: 'policy-error',
      error: {
        code: 'composition-failed',
      },
    });
  });
});
