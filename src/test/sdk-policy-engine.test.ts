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
    id: policyResolverId('framework:resolver:throws'),
    owner: 'framework',
    resolve: () => {
      throw new Error('secret resolver failure');
    },
  });

  registry.registerResolver({
    id: policyResolverId('framework:resolver:rejects'),
    owner: 'framework',
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
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'anonymous-only' }), {
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'anonymous-only' }), {
        owner: 'framework',
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'authenticated' }), {
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toMatchObject({ kind: 'unauthenticated' });

    await expect(
      registry.evaluateDeclaration(defineAccessDeclaration({ kind: 'authenticated' }), {
        owner: 'framework',
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'editor'] }),
        {
          owner: 'framework',
          subject: createSubject({ authenticated: true, roles: ['editor'] }),
        }
      )
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'editor'] }),
        {
          owner: 'framework',
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
          owner: 'framework',
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
          owner: 'framework',
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

    expect(registry.validateDeclaration(emptyRoles, 'framework')).toEqual({
      valid: false,
      issues: [
        {
          code: 'invalid-declaration',
          path: '$',
          declarationKind: 'role-any',
        },
      ],
    });

    expect(registry.validateDeclaration(emptyPermissions, 'framework')).toEqual({
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
        owner: 'framework',
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
        owner: 'framework',
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
      id: policyResolverId('framework:resolver:resource-owner'),
      owner: 'framework',
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
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'ownership',
          resolverId: policyResolverId('framework:resolver:resource-owner'),
        }),
        {
          owner: 'framework',
          subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
          resource: { ownerId: 'user-1' },
        }
      )
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'ownership',
          resolverId: policyResolverId('framework:resolver:resource-owner'),
        }),
        {
          owner: 'framework',
          subject: createSubject({ authenticated: true, subjectId: 'user-2' }),
          resource: { ownerId: 'user-1' },
        }
      )
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'ownership',
          resolverId: policyResolverId('framework:resolver:resource-owner'),
        }),
        {
          owner: 'framework',
          subject: createSubject({ authenticated: false }),
          resource: { ownerId: 'user-1' },
        }
      )
    ).resolves.toEqual({ kind: 'unauthenticated' });

    await expect(
      registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'ownership',
          resolverId: policyResolverId('framework:resolver:resource-owner'),
        }),
        {
          owner: 'framework',
          subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
          resource: {},
        }
      )
    ).resolves.toEqual({ kind: 'not-found' });

    await expect(
      registry.evaluateDeclaration(makeCustomDeclaration('allow'), {
        owner: 'framework',
        subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      })
    ).resolves.toEqual({ kind: 'allow' });

    await expect(
      registry.evaluateDeclaration(makeCustomDeclaration('forbidden'), {
        owner: 'framework',
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

    expect(registry.validateDeclaration(missingEvaluator, 'framework')).toEqual({
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

    expect(registry.validateDeclaration(missingResolver, 'framework')).toEqual({
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
        owner: 'framework',
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
        owner: 'framework',
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

    expect(firstRegistry.validateDeclaration(validDeclaration, 'framework')).toEqual({
      valid: true,
      issues: [],
    });

    expect(secondRegistry.validateDeclaration(missingDeclaration, 'framework')).toEqual({
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

    expect(secondRegistry.validateDeclaration(missingDeclaration, 'framework')).toEqual(
      secondRegistry.validateDeclaration(missingDeclaration, 'framework')
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
          owner: 'framework',
          subject: createSubject(),
        });
        const anyOfResult = await registry.evaluateDeclaration(anyOf, {
          owner: 'framework',
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
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'not-found' });

    await expect(
      registry.evaluateDeclaration(nestedEquivalent, {
        owner: 'framework',
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
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'forbidden' });

    await expect(
      registry.evaluateDeclaration(reorderedRight, {
        owner: 'framework',
        subject: createSubject(),
      })
    ).resolves.toEqual({ kind: 'forbidden' });
  });

  it('sanitizes evaluator and resolver failures without leaking raw errors', async () => {
    const registry = createFailureRegistry();

    const thrownEvaluator = makeCustomDeclaration('throws');
    const rejectedEvaluator = makeCustomDeclaration('rejects');

    const thrownResolver = defineAccessDeclaration({
      kind: 'ownership',
      resolverId: policyResolverId('framework:resolver:throws'),
    });
    const rejectedResolver = defineAccessDeclaration({
      kind: 'ownership',
      resolverId: policyResolverId('framework:resolver:rejects'),
    });

    const thrownEvaluatorResult = await registry.evaluateDeclaration(thrownEvaluator, {
      owner: 'framework',
      subject: createSubject({ authenticated: true }),
    });

    const rejectedEvaluatorResult = await registry.evaluateDeclaration(rejectedEvaluator, {
      owner: 'framework',
      subject: createSubject({ authenticated: true }),
    });

    const thrownResolverResult = await registry.evaluateDeclaration(thrownResolver, {
      owner: 'framework',
      subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
      resource: { ownerId: 'user-1' },
    });

    const rejectedResolverResult = await registry.evaluateDeclaration(rejectedResolver, {
      owner: 'framework',
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
        owner: 'framework',
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
          owner: 'framework',
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
          owner: 'framework',
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

  describe('owner-reference matrix - all 16 owner pairings', () => {
    // Test declaring/referenced owner combinations
    // Declaring owners: framework, site, plugin:a, plugin:b
    // Referenced owners: framework, site, plugin:a, plugin:b
    // Valid: framework→framework, site→site, plugin:a→plugin:a, plugin:b→plugin:b
    // Invalid: all cross-owner references

    it('allows framework to reference framework evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            owner: 'framework',
            subject: createSubject(),
          }
        )
      ).resolves.toEqual({ kind: 'allow' });
    });

    it('allows site to reference site resolvers', async () => {
      const registry = createPolicyRegistry();

      registry.registerResolver({
        id: policyResolverId('site:resolver:owner'),
        owner: 'site',
        resolve: () => 'user-1',
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'ownership',
            resolverId: policyResolverId('site:resolver:owner'),
          }),
          {
            owner: 'site',
            subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
            resource: { ownerId: 'user-1' },
          }
        )
      ).resolves.toEqual({ kind: 'allow' });
    });

    it('allows plugin:a to reference plugin:a evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:a:evaluator:allow'),
        owner: 'plugin:a',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('plugin:a:evaluator:allow'),
          }),
          {
            owner: 'plugin:a',
            subject: createSubject(),
          }
        )
      ).resolves.toEqual({ kind: 'allow' });
    });

    it('denies framework from referencing site evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('site:evaluator:allow'),
        owner: 'site',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('site:evaluator:allow'),
          }),
          {
            owner: 'framework',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies framework from referencing plugin:a evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:a:evaluator:allow'),
        owner: 'plugin:a',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('plugin:a:evaluator:allow'),
          }),
          {
            owner: 'framework',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies site from referencing framework evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            owner: 'site',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies site from referencing plugin:a resolvers', async () => {
      const registry = createPolicyRegistry();

      registry.registerResolver({
        id: policyResolverId('plugin:a:resolver:owner'),
        owner: 'plugin:a',
        resolve: () => 'user-1',
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'ownership',
            resolverId: policyResolverId('plugin:a:resolver:owner'),
          }),
          {
            owner: 'site',
            subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
            resource: { ownerId: 'user-1' },
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies plugin:a from referencing plugin:b evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:b:evaluator:allow'),
        owner: 'plugin:b',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('plugin:b:evaluator:allow'),
          }),
          {
            owner: 'plugin:a',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies plugin:a from referencing framework evaluators', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            owner: 'plugin:a',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('denies plugin:a from referencing site resolvers', async () => {
      const registry = createPolicyRegistry();

      registry.registerResolver({
        id: policyResolverId('site:resolver:owner'),
        owner: 'site',
        resolve: () => 'user-1',
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'ownership',
            resolverId: policyResolverId('site:resolver:owner'),
          }),
          {
            owner: 'plugin:a',
            subject: createSubject({ authenticated: true, subjectId: 'user-1' }),
            resource: { ownerId: 'user-1' },
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-registration' },
      });
    });

    it('rejects compositions with cross-owner references in allOf', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      registry.registerEvaluator({
        id: policyEvaluatorId('site:evaluator:forbidden'),
        owner: 'site',
        evaluate: () => ({ kind: 'forbidden' }),
      });

      // Site-declared allOf trying to reference framework evaluator (invalid)
      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'allOf',
            policies: [
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
              }),
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('site:evaluator:forbidden'),
              }),
            ],
          }),
          {
            owner: 'site',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'composition-failed' },
      });
    });

    it('rejects compositions with cross-owner references in anyOf', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:a:evaluator:allow'),
        owner: 'plugin:a',
        evaluate: () => ({ kind: 'allow' }),
      });

      registry.registerEvaluator({
        id: policyEvaluatorId('plugin:b:evaluator:allow'),
        owner: 'plugin:b',
        evaluate: () => ({ kind: 'allow' }),
      });

      // plugin:a-declared anyOf trying to reference plugin:b evaluator (invalid)
      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'anyOf',
            policies: [
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('plugin:a:evaluator:allow'),
              }),
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('plugin:b:evaluator:allow'),
              }),
            ],
          }),
          {
            owner: 'plugin:a',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'composition-failed' },
      });
    });

    it('validates owner values at runtime - rejects missing owner', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      // @ts-expect-error - Testing runtime validation with undefined owner

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: undefined as any,
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-declaration' },
      });
    });

    it('validates owner values at runtime - rejects malformed owner', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      // Testing runtime validation with malformed owner

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: 'invalid-owner' as any,
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-declaration' },
      });
    });

    it('validates owner values at runtime - rejects malformed plugin ID', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      // Testing runtime validation with malformed plugin ID

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: 'plugin:' as any,
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-declaration' },
      });
    });

    it('validates owner values at runtime - rejects plugin ID with invalid characters', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' }),
      });

      // Testing runtime validation with invalid plugin ID characters

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
          }),
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: 'plugin:foo@bar' as any,
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-declaration' },
      });
    });

    it('hardens canonicalization - rejects evaluator getters on kind', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:malicious'),
        owner: 'framework',
        evaluate: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = {
            get kind() {
              throw new Error('secret getter failure');
            },
          };
          return result;
        },
      });

      await expect(
        registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'custom',
            evaluatorId: policyEvaluatorId('framework:evaluator:malicious'),
          }),
          {
            owner: 'framework',
            subject: createSubject(),
          }
        )
      ).resolves.toMatchObject({
        kind: 'policy-error',
        error: { code: 'invalid-result' },
      });
    });

    it('hardens canonicalization - rejects evaluator objects with extra properties', async () => {
      const registry = createPolicyRegistry();

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:leaky'),
        owner: 'framework',
        evaluate: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = {
            kind: 'allow',
            secret: 'must-disappear',
            apiKey: 'exposed',
          };
          return result;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:leaky'),
        }),
        {
          owner: 'framework',
          subject: createSubject(),
        }
      );

      expect(result).toEqual({ kind: 'allow' });
      expect(result).not.toHaveProperty('secret');
      expect(result).not.toHaveProperty('apiKey');
    });

    it('hardens canonicalization - never returns evaluator object by reference', async () => {
      const registry = createPolicyRegistry();
      const evaluatorResult = { kind: 'allow' as const };

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:return-same'),
        owner: 'framework',
        evaluate: () => evaluatorResult,
      });

      const result1 = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:return-same'),
        }),
        {
          owner: 'framework',
          subject: createSubject(),
        }
      );

      expect(result1).not.toBe(evaluatorResult);
      expect(result1).toEqual({ kind: 'allow' });
    });
  });
});
