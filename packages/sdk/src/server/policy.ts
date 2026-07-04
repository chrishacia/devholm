import type {
  AccessDeclaration,
  NormalizedPolicySubject,
  OwnerId,
  PolicyErrorCode,
  PolicyErrorDetail,
  PolicyErrorResult,
  PolicyEvaluationContext,
  PolicyEvaluatorId,
  PolicyResult,
  PolicyResolverId,
  PolicyValidationIssue,
  PolicyValidationResult,
  PolicyValidationIssue as PolicyValidationIssueType,
  PolicyValidationResult as PolicyValidationResultType,
  PolicyResultKind,
} from '../contracts';

export interface PolicyEvaluatorRegistration {
  readonly id: PolicyEvaluatorId;
  readonly owner: OwnerId;
  readonly evaluate: (context: PolicyEvaluationContext) => Promise<PolicyResult> | PolicyResult;
}

export interface OwnershipResolverRegistration {
  readonly id: PolicyResolverId;
  readonly owner: OwnerId;
  readonly resolve: (
    context: PolicyEvaluationContext
  ) => Promise<string | null | undefined> | string | null | undefined;
}

export interface PolicyRegistry {
  registerEvaluator(definition: PolicyEvaluatorRegistration): void;
  registerResolver(definition: OwnershipResolverRegistration): void;
  validateDeclaration(declaration: AccessDeclaration): PolicyValidationResult;
  evaluateDeclaration(
    declaration: AccessDeclaration,
    context: PolicyEvaluationContext
  ): Promise<PolicyResult>;
}

type MaybePromise<T> = T | Promise<T>;

type OwnedIdentifierKind = 'evaluator' | 'resolver';

interface ParsedOwnedIdentifier {
  readonly owner: OwnerId;
  readonly category: OwnedIdentifierKind;
}

const allowResult = Object.freeze({ kind: 'allow' } satisfies PolicyResult);
const unauthenticatedResult = Object.freeze({ kind: 'unauthenticated' } satisfies PolicyResult);
const forbiddenResult = Object.freeze({ kind: 'forbidden' } satisfies PolicyResult);
const notFoundResult = Object.freeze({ kind: 'not-found' } satisfies PolicyResult);

const resultPrecedence: Record<PolicyResultKind, number> = {
  allow: 0,
  unauthenticated: 1,
  'not-found': 2,
  forbidden: 3,
  'policy-error': 4,
};

export function createPolicyRegistry(): PolicyRegistry {
  const evaluators = new Map<string, PolicyEvaluatorRegistration>();
  const resolvers = new Map<string, OwnershipResolverRegistration>();

  return Object.freeze({
    registerEvaluator(definition: PolicyEvaluatorRegistration): void {
      const parsed = validateOwnedIdentifier(definition.id, definition.owner, 'evaluator');

      if (evaluators.has(definition.id)) {
        throw new Error(`Duplicate evaluator registration id: ${definition.id}.`);
      }

      if (!parsed.valid) {
        throw new Error(parsed.message);
      }

      evaluators.set(definition.id, definition);
    },
    registerResolver(definition: OwnershipResolverRegistration): void {
      const parsed = validateOwnedIdentifier(definition.id, definition.owner, 'resolver');

      if (resolvers.has(definition.id)) {
        throw new Error(`Duplicate resolver registration id: ${definition.id}.`);
      }

      if (!parsed.valid) {
        throw new Error(parsed.message);
      }

      resolvers.set(definition.id, definition);
    },
    validateDeclaration(declaration: AccessDeclaration): PolicyValidationResult {
      const issues: PolicyValidationIssueType[] = [];

      validateDeclarationNode(declaration, '$', evaluators, resolvers, issues);

      return {
        valid: issues.length === 0,
        issues,
      };
    },
    async evaluateDeclaration(
      declaration: AccessDeclaration,
      context: PolicyEvaluationContext
    ): Promise<PolicyResult> {
      return evaluateDeclarationNode(declaration, context, '$', evaluators, resolvers);
    },
  });
}

export async function evaluatePolicyDeclaration(
  declaration: AccessDeclaration,
  context: PolicyEvaluationContext,
  registry = createPolicyRegistry()
): Promise<PolicyResult> {
  return registry.evaluateDeclaration(declaration, context);
}

function validateDeclarationNode(
  declaration: AccessDeclaration,
  path: string,
  evaluators: ReadonlyMap<string, PolicyEvaluatorRegistration>,
  resolvers: ReadonlyMap<string, OwnershipResolverRegistration>,
  issues: PolicyValidationIssueType[]
): void {
  switch (declaration.kind) {
    case 'everyone':
    case 'anonymous-only':
    case 'authenticated':
      return;
    case 'role-any':
      if (declaration.roles.length === 0) {
        issues.push(invalidIssue('invalid-declaration', path, 'role-any'));
      }

      return;
    case 'permission-any':
      if (declaration.permissions.length === 0) {
        issues.push(invalidIssue('invalid-declaration', path, 'permission-any'));
      }

      return;
    case 'ownership':
      if (!resolvers.has(declaration.resolverId)) {
        issues.push(missingReferenceIssue(path, declaration.resolverId, 'ownership'));
      }

      return;
    case 'custom':
      if (!evaluators.has(declaration.evaluatorId)) {
        issues.push(missingReferenceIssue(path, declaration.evaluatorId, 'custom'));
      }

      return;
    case 'allOf':
    case 'anyOf':
      if (declaration.policies.length === 0) {
        issues.push(invalidIssue('invalid-declaration', path, declaration.kind));
      }

      declaration.policies.forEach((policy, index) => {
        validateDeclarationNode(
          policy,
          `${path}.policies[${index}]`,
          evaluators,
          resolvers,
          issues
        );
      });

      return;
  }
}

async function evaluateDeclarationNode(
  declaration: AccessDeclaration,
  context: PolicyEvaluationContext,
  path: string,
  evaluators: ReadonlyMap<string, PolicyEvaluatorRegistration>,
  resolvers: ReadonlyMap<string, OwnershipResolverRegistration>
): Promise<PolicyResult> {
  switch (declaration.kind) {
    case 'everyone':
      return allowResult;
    case 'anonymous-only':
      return context.subject.authenticated ? forbiddenResult : allowResult;
    case 'authenticated':
      return context.subject.authenticated ? allowResult : unauthenticatedResult;
    case 'role-any':
      if (declaration.roles.length === 0) {
        return policyError('invalid-declaration', { path, declarationKind: declaration.kind });
      }

      return hasIntersection(context.subject.roles, declaration.roles)
        ? allowResult
        : context.subject.authenticated
          ? forbiddenResult
          : unauthenticatedResult;
    case 'permission-any':
      if (declaration.permissions.length === 0) {
        return policyError('invalid-declaration', { path, declarationKind: declaration.kind });
      }

      return hasIntersection(context.subject.permissions, declaration.permissions)
        ? allowResult
        : context.subject.authenticated
          ? forbiddenResult
          : unauthenticatedResult;
    case 'ownership': {
      const resolver = resolvers.get(declaration.resolverId);

      if (!resolver) {
        return policyError('missing-runtime-reference', {
          path,
          referenceId: declaration.resolverId,
          declarationKind: declaration.kind,
        });
      }

      let resolvedOwner: string | null | undefined;

      try {
        resolvedOwner = await resolver.resolve(context);
      } catch {
        return policyError('resolver-failed', {
          path,
          referenceId: declaration.resolverId,
          owner: resolver.owner,
          declarationKind: declaration.kind,
        });
      }

      if (resolvedOwner === null || typeof resolvedOwner === 'undefined') {
        return notFoundResult;
      }

      if (!context.subject.authenticated) {
        return unauthenticatedResult;
      }

      if (!context.subject.subjectId) {
        return policyError('invalid-result', {
          path,
          referenceId: declaration.resolverId,
          owner: resolver.owner,
          declarationKind: declaration.kind,
        });
      }

      return context.subject.subjectId === resolvedOwner ? allowResult : forbiddenResult;
    }
    case 'custom': {
      const evaluator = evaluators.get(declaration.evaluatorId);

      if (!evaluator) {
        return policyError('missing-runtime-reference', {
          path,
          referenceId: declaration.evaluatorId,
          declarationKind: declaration.kind,
        });
      }

      let result: PolicyResult;

      try {
        result = await evaluator.evaluate(context);
      } catch {
        return policyError('evaluator-failed', {
          path,
          referenceId: declaration.evaluatorId,
          owner: evaluator.owner,
          declarationKind: declaration.kind,
        });
      }

      if (!isPolicyResult(result)) {
        return policyError('invalid-result', {
          path,
          referenceId: declaration.evaluatorId,
          owner: evaluator.owner,
          declarationKind: declaration.kind,
        });
      }

      return result;
    }
    case 'allOf':
    case 'anyOf': {
      if (declaration.policies.length === 0) {
        return policyError('invalid-declaration', { path, declarationKind: declaration.kind });
      }

      const branchResults: PolicyResult[] = [];

      for (let index = 0; index < declaration.policies.length; index += 1) {
        branchResults.push(
          await evaluateDeclarationNode(
            declaration.policies[index],
            context,
            `${path}.policies[${index}]`,
            evaluators,
            resolvers
          )
        );
      }

      return declaration.kind === 'allOf'
        ? combineAllOf(branchResults, path, declaration.kind)
        : combineAnyOf(branchResults, path, declaration.kind);
    }
  }
}

function combineAllOf(
  results: readonly PolicyResult[],
  path: string,
  declarationKind: AccessDeclaration['kind']
): PolicyResult {
  if (results.some((result) => result.kind === 'policy-error')) {
    return policyError('composition-failed', { path, declarationKind });
  }

  return results.reduce<PolicyResult>((selected, current) => {
    return resultPrecedence[current.kind] > resultPrecedence[selected.kind] ? current : selected;
  }, allowResult);
}

function combineAnyOf(
  results: readonly PolicyResult[],
  path: string,
  declarationKind: AccessDeclaration['kind']
): PolicyResult {
  if (results.some((result) => result.kind === 'policy-error')) {
    return policyError('composition-failed', { path, declarationKind });
  }

  if (results.some((result) => result.kind === 'allow')) {
    return allowResult;
  }

  return results.reduce<PolicyResult>((selected, current) => {
    return resultPrecedence[current.kind] > resultPrecedence[selected.kind] ? current : selected;
  }, unauthenticatedResult);
}

function policyError(
  code: PolicyErrorCode,
  detail: Omit<PolicyErrorDetail, 'code'>
): PolicyErrorResult {
  return {
    kind: 'policy-error',
    error: {
      code,
      ...detail,
    },
  };
}

function invalidIssue(
  code: PolicyErrorCode,
  path: string,
  declarationKind: AccessDeclaration['kind']
): PolicyValidationIssueType {
  return {
    code,
    path,
    declarationKind,
  };
}

function missingReferenceIssue(
  path: string,
  referenceId: string,
  declarationKind: AccessDeclaration['kind']
): PolicyValidationIssueType {
  return {
    code: 'missing-runtime-reference',
    path,
    referenceId,
    declarationKind,
  };
}

function isPolicyResult(value: unknown): value is PolicyResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const kind = (value as Partial<PolicyResult>).kind;

  if (
    kind !== 'allow' &&
    kind !== 'unauthenticated' &&
    kind !== 'forbidden' &&
    kind !== 'not-found' &&
    kind !== 'policy-error'
  ) {
    return false;
  }

  if (kind !== 'policy-error') {
    return true;
  }

  const error = (value as PolicyErrorResult).error;

  return typeof error === 'object' && error !== null && typeof error.code === 'string';
}

function hasIntersection<T>(left: readonly T[], right: readonly T[]): boolean {
  for (const item of left) {
    if (right.includes(item)) {
      return true;
    }
  }

  return false;
}

function validateOwnedIdentifier(
  id: string,
  owner: OwnerId,
  expectedCategory: OwnedIdentifierKind
):
  | { readonly valid: true; readonly parsed: ParsedOwnedIdentifier }
  | { readonly valid: false; readonly message: string } {
  const parsed = parseOwnedIdentifier(id);

  if (!parsed) {
    return { valid: false, message: `Invalid ${expectedCategory} identifier: ${id}.` };
  }

  if (parsed.category !== expectedCategory) {
    return {
      valid: false,
      message: `Invalid ${expectedCategory} identifier category: ${id}.`,
    };
  }

  if (parsed.owner !== owner) {
    return {
      valid: false,
      message: `Identifier owner mismatch for ${expectedCategory}: ${id}.`,
    };
  }

  return { valid: true, parsed };
}

function parseOwnedIdentifier(id: string): ParsedOwnedIdentifier | null {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return null;
  }

  const segments = id.split(':');

  if (segments[0] === 'plugin') {
    if (segments.length < 4 || !segments[1] || !segments[2] || !segments[3]) {
      return null;
    }

    return {
      owner: `plugin:${segments[1]}` as OwnerId,
      category: segments[2] as OwnedIdentifierKind,
    };
  }

  if (segments.length < 3 || !segments[0] || !segments[1] || !segments[2]) {
    return null;
  }

  if (segments[0] !== 'framework' && segments[0] !== 'site') {
    return null;
  }

  return {
    owner: segments[0] as OwnerId,
    category: segments[1] as OwnedIdentifierKind,
  };
}
