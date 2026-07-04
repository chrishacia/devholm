import { defineAccessDeclaration, permissionId, type AccessDeclaration } from '@devholm/sdk';
import { assertAccessDeclarationSerializable } from '@devholm/sdk/testing';
import { describe, expect, it } from 'vitest';

describe('SDK testing serializability assertions', () => {
  it('serializes a valid access declaration without losing nested content', () => {
    const declaration = defineAccessDeclaration({
      kind: 'allOf',
      policies: [
        defineAccessDeclaration({ kind: 'authenticated' }),
        defineAccessDeclaration({
          kind: 'anyOf',
          policies: [
            defineAccessDeclaration({ kind: 'role-any', roles: ['admin', 'editor'] }),
            defineAccessDeclaration({
              kind: 'permission-any',
              permissions: [permissionId('posts.edit'), permissionId('posts.publish')],
            }),
          ],
        }),
      ],
    });

    const serialized = assertAccessDeclarationSerializable(declaration);

    expect(serialized).toBe(
      '{"kind":"allOf","policies":[{"kind":"authenticated"},{"kind":"anyOf","policies":[{"kind":"role-any","roles":["admin","editor"]},{"kind":"permission-any","permissions":["posts.edit","posts.publish"]}]}]}'
    );
  });

  it('rejects nested undefined, function, symbol, bigint, and non-finite number values', () => {
    const malformedDeclarations: Array<{ label: string; value: AccessDeclaration }> = [
      {
        label: 'undefined',
        value: {
          kind: 'role-any',
          roles: ['admin', undefined as unknown as string],
        } as AccessDeclaration,
      },
      {
        label: 'function',
        value: {
          kind: 'role-any',
          roles: ['admin', (() => 'editor') as unknown as string],
        } as AccessDeclaration,
      },
      {
        label: 'symbol',
        value: {
          kind: 'role-any',
          roles: ['admin', Symbol('editor') as unknown as string],
        } as AccessDeclaration,
      },
      {
        label: 'bigint',
        value: {
          kind: 'role-any',
          roles: ['admin', BigInt(1) as unknown as string],
        } as AccessDeclaration,
      },
      {
        label: 'non-finite number',
        value: {
          kind: 'role-any',
          roles: ['admin', Number.NaN as unknown as string],
        } as AccessDeclaration,
      },
    ];

    for (const malformedDeclaration of malformedDeclarations) {
      expect(() => assertAccessDeclarationSerializable(malformedDeclaration.value)).toThrow(
        malformedDeclaration.label === 'non-finite number'
          ? /non-finite number/
          : /unsupported value/
      );
    }
  });

  it('rejects circular declarations', () => {
    const circularDeclaration: Record<string, unknown> = {
      kind: 'custom',
      evaluatorId: 'self',
    };

    circularDeclaration.self = circularDeclaration;

    expect(() =>
      assertAccessDeclarationSerializable(circularDeclaration as AccessDeclaration)
    ).toThrow(/circular reference/);
  });

  it('accepts a nested allOf/anyOf declaration and returns the complete serialization payload', () => {
    const declaration = defineAccessDeclaration({
      kind: 'anyOf',
      policies: [
        defineAccessDeclaration({ kind: 'everyone' }),
        defineAccessDeclaration({
          kind: 'allOf',
          policies: [
            defineAccessDeclaration({ kind: 'anonymous-only' }),
            defineAccessDeclaration({ kind: 'authenticated' }),
          ],
        }),
      ],
    });

    const serialized = assertAccessDeclarationSerializable(declaration);

    expect(serialized).toBe(
      '{"kind":"anyOf","policies":[{"kind":"everyone"},{"kind":"allOf","policies":[{"kind":"anonymous-only"},{"kind":"authenticated"}]}]}'
    );
  });
});
