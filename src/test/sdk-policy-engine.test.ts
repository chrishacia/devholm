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

  describe('comprehensive owner validation', () => {
    it('validates undefined owner at declaration time', () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' as const }),
      });

      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any
      );

      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'invalid-declaration' })
      );
    });

    it('validates null owner at declaration time', () => {
      const registry = createPolicyRegistry();
      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        null as any
      );

      expect(result.valid).toBe(false);
    });

    it('validates non-string owner at declaration time', () => {
      const registry = createPolicyRegistry();
      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        12345 as any
      );

      expect(result.valid).toBe(false);
    });

    it('validates unknown owner string at declaration time', () => {
      const registry = createPolicyRegistry();
      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'invalid-owner' as any
      );

      expect(result.valid).toBe(false);
    });

    it('validates empty plugin ID at declaration time', () => {
      const registry = createPolicyRegistry();
      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'plugin:' as any
      );

      expect(result.valid).toBe(false);
    });

    it('validates invalid plugin ID characters at declaration time', () => {
      const registry = createPolicyRegistry();
      const result = registry.validateDeclaration(
        defineAccessDeclaration({ kind: 'everyone' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'plugin:foo@bar' as any
      );

      expect(result.valid).toBe(false);
    });

    it('rejects undefined owner at evaluation time', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' as const }),
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
        }),
        {
          subject: createSubject(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          owner: undefined as any,
        }
      );

      expect(result).toEqual({
        kind: 'policy-error',
        error: { code: 'invalid-declaration' },
      });
    });

    it('rejects invalid owner at evaluation time', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:allow'),
        owner: 'framework',
        evaluate: () => ({ kind: 'allow' as const }),
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:allow'),
        }),
        {
          subject: createSubject(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          owner: 'not-a-real-owner' as any,
        }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-declaration');
      }
    });
  });

  describe('complete 4x4 owner-reference matrix', () => {
    const owners = ['framework', 'site', 'plugin:a', 'plugin:b'] as const;

    for (const declaringOwner of owners) {
      for (const registeredOwner of owners) {
        const shouldAllow = declaringOwner === registeredOwner;
        const testName = shouldAllow
          ? `allows ${declaringOwner} → ${registeredOwner} (same owner)`
          : `denies ${declaringOwner} → ${registeredOwner} (cross-owner)`;

        it(testName, async () => {
          const registry = createPolicyRegistry();
          let evaluatorInvoked = false;

          registry.registerEvaluator({
            id: policyEvaluatorId(`${registeredOwner}:evaluator:test`),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: registeredOwner as any,
            evaluate: () => {
              evaluatorInvoked = true;
              return { kind: 'allow' as const };
            },
          });

          const result = await registry.evaluateDeclaration(
            defineAccessDeclaration({
              kind: 'custom',
              evaluatorId: policyEvaluatorId(`${registeredOwner}:evaluator:test`),
            }),
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              owner: declaringOwner as any,
              subject: createSubject(),
            }
          );

          if (shouldAllow) {
            expect(result).toEqual({ kind: 'allow' });
            expect(evaluatorInvoked).toBe(true);
          } else {
            expect(result).toEqual({
              kind: 'policy-error',
              error: { code: 'invalid-registration' },
            });
            expect(evaluatorInvoked).toBe(false);
          }
        });

        it(`resolver: ${declaringOwner} → ${registeredOwner} (${shouldAllow ? 'allow' : 'deny'})`, async () => {
          const registry = createPolicyRegistry();
          let resolverInvoked = false;

          registry.registerResolver({
            id: policyResolverId(`${registeredOwner}:resolver:test`),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            owner: registeredOwner as any,
            resolve: () => {
              resolverInvoked = true;
              return 'resource-owner';
            },
          });

          const result = await registry.evaluateDeclaration(
            defineAccessDeclaration({
              kind: 'ownership',
              resolverId: policyResolverId(`${registeredOwner}:resolver:test`),
            }),
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              owner: declaringOwner as any,
              subject: createSubject({ authenticated: true, subjectId: 'resource-owner' }),
            }
          );

          if (shouldAllow) {
            expect(result).toEqual({ kind: 'allow' });
            expect(resolverInvoked).toBe(true);
          } else {
            expect(result).toEqual({
              kind: 'policy-error',
              error: { code: 'invalid-registration' },
            });
            expect(resolverInvoked).toBe(false);
          }
        });
      }
    }
  });

  describe('hostile evaluator result canonicalization comprehensive', () => {
    it('rejects undefined as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-undefined'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => undefined as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-undefined'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result).toEqual({
        kind: 'policy-error',
        error: { code: 'invalid-result' },
      });
    });

    it('rejects null as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-null'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => null as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-null'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects string as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-string'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => 'allow' as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-string'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
    });

    it('rejects array as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-array'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => ['allow'] as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-array'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
    });

    it('rejects class instance as evaluator result', async () => {
      const registry = createPolicyRegistry();

      class CustomResult {
        kind = 'allow' as const;
      }

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-class'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => new CustomResult() as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-class'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects unknown result kind', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:unknown-kind'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => ({ kind: 'unknown-result' }) as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:unknown-kind'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects policy-error without error object', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:malformed-error'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => ({ kind: 'policy-error' }) as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:malformed-error'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects unknown error code', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:bad-code'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => ({ kind: 'policy-error', error: { code: 'unknown-code' } }) as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:bad-code'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('ensures public error result does not expose diagnostic fields', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:with-diagnostics'),
        owner: 'framework',
        evaluate: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = {
            kind: 'policy-error',
            error: {
              code: 'invalid-result',
              path: '$.test',
              owner: 'framework',
              referenceId: 'eval:123',
              declarationKind: 'custom',
            },
          };
          return result;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:with-diagnostics'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result).toEqual({
        kind: 'policy-error',
        error: { code: 'invalid-result' },
      });
      if (result.kind === 'policy-error') {
        expect(result.error).not.toHaveProperty('path');
        expect(result.error).not.toHaveProperty('owner');
        expect(result.error).not.toHaveProperty('referenceId');
        expect(result.error).not.toHaveProperty('declarationKind');
      }
    });

    it('rejects boolean as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-boolean'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => true as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-boolean'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects number as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-number'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => 42 as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-number'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects function as evaluator result', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:returns-function'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => (() => {}) as any,
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:returns-function'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects object with custom prototype as evaluator result', async () => {
      const registry = createPolicyRegistry();

      class CustomPrototype {
        kind = 'allow' as const;
      }

      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:custom-prototype'),
        owner: 'framework',
        evaluate: () => {
          const obj = Object.create(CustomPrototype.prototype);
          obj.kind = 'allow';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return obj as any;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:custom-prototype'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects result with getter on kind property', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:kind-getter'),
        owner: 'framework',
        evaluate: () => {
          return {
            get kind() {
              return 'allow';
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:kind-getter'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects result with setter on kind property', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:kind-setter'),
        owner: 'framework',
        evaluate: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const obj: any = {};
          Object.defineProperty(obj, 'kind', {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            set(_v: unknown) {
              // empty setter – never executed by canonical path
            },
            enumerable: true,
          });
          obj.kind = 'allow';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return obj as any;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:kind-setter'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('rejects result with non-enumerable kind property', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:non-enumerable-kind'),
        owner: 'framework',
        evaluate: () => {
          const obj: Record<string, unknown> = {};
          Object.defineProperty(obj, 'kind', {
            value: 'allow',
            enumerable: false,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return obj as any;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:non-enumerable-kind'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      expect(result.kind).toBe('policy-error');
      if (result.kind === 'policy-error') {
        expect(result.error.code).toBe('invalid-result');
      }
    });

    it('allows result with symbol-keyed extra property (symbols are not enumerable string keys)', async () => {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:symbol-property'),
        owner: 'framework',
        evaluate: () => {
          const sym = Symbol('hostile');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const obj: any = {
            kind: 'allow',
            [sym]: 'secret-data',
          };
          return obj;
        },
      });

      const result = await registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:symbol-property'),
        }),
        { owner: 'framework', subject: createSubject() }
      );

      // Symbols are not checked by canonicalizePolicyResult; the result is canonical allow
      // and the symbol-keyed extra data is not propagated to the result.
      expect(result.kind).toBe('allow');
      expect(result).not.toHaveProperty('symbol-data');
    });
  });

  describe('invalid owner validation matrix', () => {
    const invalidOwnerCases: Array<{ value: unknown; label: string }> = [
      { value: undefined, label: 'undefined' },
      { value: null, label: 'null' },
      { value: '', label: 'empty string' },
      { value: 'unknown', label: 'unknown string format' },
      { value: 'plugin:', label: 'plugin: with no ID' },
      { value: 'plugin:inv@lid!', label: 'plugin: with invalid chars' },
      { value: `plugin:${'x'.repeat(200)}`, label: 'plugin: with excessively long ID' },
      { value: 123, label: 'number' },
      { value: true, label: 'boolean' },
      { value: {}, label: 'object' },
    ];

    for (const testCase of invalidOwnerCases) {
      describe(`owner is ${testCase.label}`, () => {
        it('validateDeclaration returns invalid with invalid-declaration code', () => {
          const registry = createPolicyRegistry();
          const result = registry.validateDeclaration(
            defineAccessDeclaration({ kind: 'everyone' }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            testCase.value as any
          );
          expect(result.valid).toBe(false);
          expect(result.issues).toHaveLength(1);
          expect(result.issues[0]).toHaveProperty('code', 'invalid-declaration');
        });

        it('evaluateDeclaration returns policy-error invalid-declaration without throwing', async () => {
          const registry = createPolicyRegistry();
          let threw = false;
          let result: Awaited<ReturnType<typeof registry.evaluateDeclaration>> | null = null;
          try {
            result = await registry.evaluateDeclaration(
              defineAccessDeclaration({ kind: 'everyone' }),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { owner: testCase.value as any, subject: createSubject() }
            );
          } catch {
            threw = true;
          }
          expect(threw).toBe(false);
          expect(result?.kind).toBe('policy-error');
          if (result?.kind === 'policy-error') {
            expect(result.error).toEqual({ code: 'invalid-declaration' });
          }
        });

        it('evaluateDeclaration with custom decl returns policy-error invalid-declaration without throwing', async () => {
          const registry = createPolicyRegistry();
          registry.registerEvaluator({
            id: policyEvaluatorId('framework:evaluator:owner-matrix-custom'),
            owner: 'framework',
            evaluate: () => ({ kind: 'allow' }),
          });
          let threw = false;
          let result: Awaited<ReturnType<typeof registry.evaluateDeclaration>> | null = null;
          try {
            result = await registry.evaluateDeclaration(
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('framework:evaluator:owner-matrix-custom'),
              }),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { owner: testCase.value as any, subject: createSubject() }
            );
          } catch {
            threw = true;
          }
          expect(threw).toBe(false);
          expect(result?.kind).toBe('policy-error');
          if (result?.kind === 'policy-error') {
            expect(result.error).toEqual({ code: 'invalid-declaration' });
          }
        });
      });
    }
  });

  describe('validation-time and runtime owner-reference matrix', () => {
    // Framework can only reference framework; site can only reference site;
    // plugin:X can only reference plugin:X.
    const pairs: Array<{
      declaring: 'framework' | 'site' | 'plugin:a' | 'plugin:b';
      registered: 'framework' | 'site' | 'plugin:a' | 'plugin:b';
      allowed: boolean;
    }> = [
      { declaring: 'framework', registered: 'framework', allowed: true },
      { declaring: 'framework', registered: 'site', allowed: false },
      { declaring: 'framework', registered: 'plugin:a', allowed: false },
      { declaring: 'framework', registered: 'plugin:b', allowed: false },
      { declaring: 'site', registered: 'framework', allowed: false },
      { declaring: 'site', registered: 'site', allowed: true },
      { declaring: 'site', registered: 'plugin:a', allowed: false },
      { declaring: 'site', registered: 'plugin:b', allowed: false },
      { declaring: 'plugin:a', registered: 'framework', allowed: false },
      { declaring: 'plugin:a', registered: 'site', allowed: false },
      { declaring: 'plugin:a', registered: 'plugin:a', allowed: true },
      { declaring: 'plugin:a', registered: 'plugin:b', allowed: false },
      { declaring: 'plugin:b', registered: 'framework', allowed: false },
      { declaring: 'plugin:b', registered: 'site', allowed: false },
      { declaring: 'plugin:b', registered: 'plugin:a', allowed: false },
      { declaring: 'plugin:b', registered: 'plugin:b', allowed: true },
    ];

    describe('validation-time evaluator matrix (16 pairs)', () => {
      for (const { declaring, registered, allowed } of pairs) {
        it(`declaring=${declaring} registered=${registered} => ${allowed ? 'valid' : 'invalid-registration'}`, () => {
          const registry = createPolicyRegistry();
          registry.registerEvaluator({
            id: policyEvaluatorId(`${registered}:evaluator:matrix-val`),
            owner: registered,
            evaluate: () => ({ kind: 'allow' }),
          });
          const result = registry.validateDeclaration(
            defineAccessDeclaration({
              kind: 'custom',
              evaluatorId: policyEvaluatorId(`${registered}:evaluator:matrix-val`),
            }),
            declaring
          );
          if (allowed) {
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
          } else {
            expect(result.valid).toBe(false);
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0]).toHaveProperty('code', 'invalid-registration');
          }
        });
      }
    });

    describe('validation-time resolver matrix (16 pairs)', () => {
      for (const { declaring, registered, allowed } of pairs) {
        it(`declaring=${declaring} registered=${registered} => ${allowed ? 'valid' : 'invalid-registration'}`, () => {
          const registry = createPolicyRegistry();
          registry.registerResolver({
            id: policyResolverId(`${registered}:resolver:matrix`),
            owner: registered,
            resolve: async () => null,
          });
          const result = registry.validateDeclaration(
            defineAccessDeclaration({
              kind: 'ownership',
              resolverId: policyResolverId(`${registered}:resolver:matrix`),
            }),
            declaring
          );
          if (allowed) {
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
          } else {
            expect(result.valid).toBe(false);
            expect(result.issues).toHaveLength(1);
            expect(result.issues[0]).toHaveProperty('code', 'invalid-registration');
          }
        });
      }
    });

    describe('runtime evaluator matrix – cross-owner rejected and callbacks never invoked', () => {
      for (const { declaring, registered, allowed } of pairs) {
        if (allowed) continue; // skip same-owner; covered elsewhere
        it(`declaring=${declaring} registered=${registered} => invalid-registration, callback not invoked`, async () => {
          const registry = createPolicyRegistry();
          let invoked = false;
          registry.registerEvaluator({
            id: policyEvaluatorId(`${registered}:evaluator:runtime-matrix`),
            owner: registered,
            evaluate: () => {
              invoked = true;
              return { kind: 'allow' };
            },
          });
          const result = await registry.evaluateDeclaration(
            defineAccessDeclaration({
              kind: 'custom',
              evaluatorId: policyEvaluatorId(`${registered}:evaluator:runtime-matrix`),
            }),
            { owner: declaring, subject: createSubject() }
          );
          expect(result.kind).toBe('policy-error');
          if (result.kind === 'policy-error') {
            expect(result.error).toEqual({ code: 'invalid-registration' });
          }
          expect(invoked).toBe(false);
        });
      }
    });

    describe('runtime resolver matrix – cross-owner rejected and callbacks never invoked', () => {
      for (const { declaring, registered, allowed } of pairs) {
        if (allowed) continue;
        it(`declaring=${declaring} registered=${registered} => invalid-registration, resolver not invoked`, async () => {
          const registry = createPolicyRegistry();
          let invoked = false;
          registry.registerResolver({
            id: policyResolverId(`${registered}:resolver:runtime-matrix`),
            owner: registered,
            resolve: async () => {
              invoked = true;
              return null;
            },
          });
          const result = await registry.evaluateDeclaration(
            defineAccessDeclaration({
              kind: 'ownership',
              resolverId: policyResolverId(`${registered}:resolver:runtime-matrix`),
            }),
            { owner: declaring, subject: createSubject() }
          );
          expect(result.kind).toBe('policy-error');
          if (result.kind === 'policy-error') {
            expect(result.error).toEqual({ code: 'invalid-registration' });
          }
          expect(invoked).toBe(false);
        });
      }
    });

    describe('nested allOf / anyOf cross-owner violation', () => {
      it('allOf: validation rejects cross-owner evaluator nested inside allOf', () => {
        const registry = createPolicyRegistry();
        registry.registerEvaluator({
          id: policyEvaluatorId('site:evaluator:nested-allof'),
          owner: 'site',
          evaluate: () => ({ kind: 'allow' }),
        });
        const result = registry.validateDeclaration(
          defineAccessDeclaration({
            kind: 'allOf',
            policies: [
              defineAccessDeclaration({ kind: 'everyone' }),
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('site:evaluator:nested-allof'),
              }),
            ],
          }),
          'framework'
        );
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.code === 'invalid-registration')).toBe(true);
      });

      it('anyOf: validation rejects cross-owner resolver nested inside anyOf', () => {
        const registry = createPolicyRegistry();
        registry.registerResolver({
          id: policyResolverId('site:resolver:nested-anyof'),
          owner: 'site',
          resolve: async () => null,
        });
        const result = registry.validateDeclaration(
          defineAccessDeclaration({
            kind: 'anyOf',
            policies: [
              defineAccessDeclaration({ kind: 'anonymous-only' }),
              defineAccessDeclaration({
                kind: 'ownership',
                resolverId: policyResolverId('site:resolver:nested-anyof'),
              }),
            ],
          }),
          'framework'
        );
        expect(result.valid).toBe(false);
        expect(result.issues.some((i) => i.code === 'invalid-registration')).toBe(true);
      });

      it('allOf: runtime fails closed on cross-owner; cross-owner callback not invoked', async () => {
        const registry = createPolicyRegistry();
        let invoked = false;
        registry.registerEvaluator({
          id: policyEvaluatorId('site:evaluator:allof-runtime'),
          owner: 'site',
          evaluate: () => {
            invoked = true;
            return { kind: 'allow' };
          },
        });
        const result = await registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'allOf',
            policies: [
              defineAccessDeclaration({ kind: 'everyone' }),
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('site:evaluator:allof-runtime'),
              }),
            ],
          }),
          { owner: 'framework', subject: createSubject() }
        );
        expect(result.kind).toBe('policy-error');
        if (result.kind === 'policy-error') {
          // composed error
          expect(['composition-failed', 'invalid-registration']).toContain(result.error.code);
        }
        expect(invoked).toBe(false);
      });

      it('equivalent reordered allOf trees produce equivalent outcomes', async () => {
        const registry = createPolicyRegistry();
        registry.registerEvaluator({
          id: policyEvaluatorId('site:evaluator:reorder-a'),
          owner: 'site',
          evaluate: () => ({ kind: 'allow' }),
        });
        // order 1: everyone then cross-owner
        const result1 = await registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'allOf',
            policies: [
              defineAccessDeclaration({ kind: 'everyone' }),
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('site:evaluator:reorder-a'),
              }),
            ],
          }),
          { owner: 'framework', subject: createSubject() }
        );
        // order 2: cross-owner then everyone
        const result2 = await registry.evaluateDeclaration(
          defineAccessDeclaration({
            kind: 'allOf',
            policies: [
              defineAccessDeclaration({
                kind: 'custom',
                evaluatorId: policyEvaluatorId('site:evaluator:reorder-a'),
              }),
              defineAccessDeclaration({ kind: 'everyone' }),
            ],
          }),
          { owner: 'framework', subject: createSubject() }
        );
        expect(result1.kind).toBe('policy-error');
        expect(result2.kind).toBe('policy-error');
        expect(result1).toEqual(result2);
      });
    });
  });

  describe('hostile evaluator result canonicalization – extended', () => {
    async function evalHostile(
      returnValue: unknown
    ): Promise<
      ReturnType<typeof createPolicyRegistry>['evaluateDeclaration'] extends (
        ...args: infer _
      ) => Promise<infer R>
        ? R
        : never
    > {
      const registry = createPolicyRegistry();
      registry.registerEvaluator({
        id: policyEvaluatorId('framework:evaluator:hostile-result'),
        owner: 'framework',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluate: () => returnValue as any,
      });
      return registry.evaluateDeclaration(
        defineAccessDeclaration({
          kind: 'custom',
          evaluatorId: policyEvaluatorId('framework:evaluator:hostile-result'),
        }),
        { owner: 'framework', subject: createSubject() }
      );
    }

    const invalidResultError = {
      kind: 'policy-error' as const,
      error: { code: 'invalid-result' as const },
    };

    it('rejects boolean true', async () => {
      expect(await evalHostile(true)).toEqual(invalidResultError);
    });

    it('rejects boolean false', async () => {
      expect(await evalHostile(false)).toEqual(invalidResultError);
    });

    it('rejects number 0', async () => {
      expect(await evalHostile(0)).toEqual(invalidResultError);
    });

    it('rejects number 42', async () => {
      expect(await evalHostile(42)).toEqual(invalidResultError);
    });

    it('rejects function', async () => {
      expect(await evalHostile(() => ({ kind: 'allow' }))).toEqual(invalidResultError);
    });

    it('rejects class instance with correct kind', async () => {
      class FakeAllow {
        kind = 'allow' as const;
      }
      expect(await evalHostile(new FakeAllow())).toEqual(invalidResultError);
    });

    it('rejects object with custom null-chain prototype', async () => {
      const obj = Object.create(null) as Record<string, unknown>;
      obj['kind'] = 'allow';
      // null prototype is allowed per canonicalize, so this should pass
      const result = await evalHostile(obj);
      expect(result.kind).toBe('allow');
    });

    it('rejects custom class prototype even when kind is valid', async () => {
      class MyResult {
        kind = 'allow' as const;
      }
      const obj = new MyResult();
      expect(await evalHostile(obj)).toEqual(invalidResultError);
    });

    it('rejects getter on kind – getter never executed', async () => {
      let getterExecuted = 0;
      const obj = Object.defineProperty({}, 'kind', {
        get() {
          getterExecuted++;
          return 'allow';
        },
        enumerable: true,
        configurable: true,
      });
      expect(await evalHostile(obj)).toEqual(invalidResultError);
      expect(getterExecuted).toBe(0);
    });

    it('rejects setter on kind – setter never executed', async () => {
      let setterExecuted = 0;
      const obj = Object.defineProperty({}, 'kind', {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        set(_v: unknown) {
          setterExecuted++;
        },
        enumerable: true,
        configurable: true,
      });
      expect(await evalHostile(obj)).toEqual(invalidResultError);
      expect(setterExecuted).toBe(0);
    });

    it('rejects non-enumerable kind property', async () => {
      const obj = Object.defineProperty({}, 'kind', {
        value: 'allow',
        enumerable: false,
        configurable: true,
        writable: true,
      });
      expect(await evalHostile(obj)).toEqual(invalidResultError);
    });

    it('rejects getter on error field in policy-error result', async () => {
      let getterExecuted = 0;
      const obj = Object.defineProperty({ kind: 'policy-error' }, 'error', {
        get() {
          getterExecuted++;
          return { code: 'evaluator-failed' };
        },
        enumerable: true,
        configurable: true,
      });
      expect(await evalHostile(obj)).toEqual(invalidResultError);
      expect(getterExecuted).toBe(0);
    });

    it('rejects getter on error.code in policy-error result', async () => {
      let getterExecuted = 0;
      const error = Object.defineProperty({}, 'code', {
        get() {
          getterExecuted++;
          return 'evaluator-failed';
        },
        enumerable: true,
        configurable: true,
      });
      expect(await evalHostile({ kind: 'policy-error', error })).toEqual(invalidResultError);
      expect(getterExecuted).toBe(0);
    });

    it('allows symbol-keyed top-level property – symbol data not propagated to canonical result', async () => {
      const sym = Symbol('hostile');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = { kind: 'allow', [sym]: 'secret' };
      // Symbols are not enumerable string keys; canonicalizePolicyResult ignores them.
      // The object has plain Object.prototype and enumerable kind=allow, so it canonicalizes to allow.
      const result = await evalHostile(obj);
      expect(result.kind).toBe('allow');
      expect(result).not.toBe(obj); // not the evaluator-provided object
    });

    it('rejects result with secret/API-key fields – never exposed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = {
        kind: 'allow',
        apiKey: 'sk-secret-12345',
        password: 'hunter2',
      };
      const result = await evalHostile(obj);
      // The canonical result must not contain apiKey or password
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('password');
      // Should canonicalize to allow (extra properties are benign on plain object)
      expect(result.kind).toBe('allow');
    });

    it('rejects original object reference – result is canonical, not same object', async () => {
      const original = { kind: 'allow' as const };
      const result = await evalHostile(original);
      expect(result.kind).toBe('allow');
      // The returned object must not be the evaluator-provided object
      expect(result).not.toBe(original);
    });

    it('rejects result with message/stack fields on policy-error – never exposed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = {
        kind: 'policy-error',
        error: { code: 'evaluator-failed' },
        message: 'internal leak',
        stack: 'Error: at eval(...)',
      };
      const result = await evalHostile(obj);
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('stack');
      if (result.kind === 'policy-error') {
        expect(result.error).toEqual({ code: 'evaluator-failed' });
      }
    });
  });
});
