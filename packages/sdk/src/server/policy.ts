import type {
  AccessDeclaration,
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
  validateDeclaration(declaration: AccessDeclaration, owner: OwnerId): PolicyValidationResult;
  evaluateDeclaration(
    declaration: AccessDeclaration,
    context: PolicyEvaluationContext & { owner: OwnerId }
  ): Promise<PolicyResult>;
}

type OwnedIdentifierKind = 'evaluator' | 'resolver';

interface ParsedOwnedIdentifier {
  readonly owner: OwnerId;
  readonly category: OwnedIdentifierKind;
}

type PolicyResultKind = 'allow' | 'unauthenticated' | 'forbidden' | 'not-found' | 'policy-error';

const VALID_POLICY_RESULT_KINDS = new Set<PolicyResultKind>([
  'allow',
  'unauthenticated',
  'forbidden',
  'not-found',
  'policy-error',
]);

const VALID_POLICY_ERROR_CODES = new Set<PolicyErrorCode>([
  'invalid-declaration',
  'invalid-identifier',
  'invalid-registration',
  'missing-runtime-reference',
  'evaluator-failed',
  'resolver-failed',
  'composition-failed',
  'invalid-result',
]);

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

function canOwnerReferencePath(referencingOwner: OwnerId, referencedOwner: OwnerId): boolean {
  if (referencingOwner === 'framework') {
    return referencedOwner === 'framework';
  }

  if (referencingOwner === 'site') {
    return referencedOwner === 'site';
  }

  if (referencingOwner.startsWith('plugin:')) {
    return referencingOwner === referencedOwner;
  }

  return false;
}

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
    validateDeclaration(declaration: AccessDeclaration, owner: OwnerId): PolicyValidationResult {
      const issues: PolicyValidationIssue[] = [];

      validateDeclarationNode(declaration, '$', owner, evaluators, resolvers, issues);

      return {
        valid: issues.length === 0,
        issues,
      };
    },
    async evaluateDeclaration(
      declaration: AccessDeclaration,
      context: PolicyEvaluationContext & { owner: OwnerId }
    ): Promise<PolicyResult> {
      return evaluateDeclarationNode(
        declaration,
        context,
        '$',
        context.owner,
        evaluators,
        resolvers
      );
    },
  });
}

export async function evaluatePolicyDeclaration(
  declaration: AccessDeclaration,
  context: PolicyEvaluationContext & { owner: OwnerId },
  registry = createPolicyRegistry()
): Promise<PolicyResult> {
  return registry.evaluateDeclaration(declaration, context);
}

function validateDeclarationNode(
  declaration: AccessDeclaration,
  path: string,
  declaringOwner: OwnerId,
  evaluators: ReadonlyMap<string, PolicyEvaluatorRegistration>,
  resolvers: ReadonlyMap<string, OwnershipResolverRegistration>,
  issues: PolicyValidationIssue[]
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
    case 'ownership': {
      if (!resolvers.has(declaration.resolverId)) {
        issues.push(missingReferenceIssue(path, declaration.resolverId, 'ownership'));
        return;
      }

      const resolver = resolvers.get(declaration.resolverId);
      if (resolver && !canOwnerReferencePath(declaringOwner, resolver.owner)) {
        issues.push(invalidIssue('invalid-declaration', path, 'ownership'));
      }

      return;
    }
    case 'custom': {
      if (!evaluators.has(declaration.evaluatorId)) {
        issues.push(missingReferenceIssue(path, declaration.evaluatorId, 'custom'));
        return;
      }

      const evaluator = evaluators.get(declaration.evaluatorId);
      if (evaluator && !canOwnerReferencePath(declaringOwner, evaluator.owner)) {
        issues.push(invalidIssue('invalid-declaration', path, 'custom'));
      }

      return;
    }
    case 'allOf':
    case 'anyOf':
      if (declaration.policies.length === 0) {
        issues.push(invalidIssue('invalid-declaration', path, declaration.kind));
      }

      declaration.policies.forEach((policy, index) => {
        validateDeclarationNode(
          policy,
          `${path}.policies[${index}]`,
          declaringOwner,
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
  declaringOwner: OwnerId,
  evaluators: ReadonlyMap<string, PolicyEvaluatorRegistration>,
  resolvers: ReadonlyMap<string, OwnershipResolverRegistration>
): Promise<PolicyResult> {
  // Validate owner at entry point to fail closed on invalid/missing owners
  if (!isValidOwnerId(declaringOwner)) {
    return policyError('invalid-declaration', { path, declarationKind: declaration.kind });
  }

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

      if (!canOwnerReferencePath(declaringOwner, resolver.owner)) {
        return policyError('invalid-registration', {
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

      if (!canOwnerReferencePath(declaringOwner, evaluator.owner)) {
        return policyError('invalid-registration', {
          path,
          referenceId: declaration.evaluatorId,
          declarationKind: declaration.kind,
        });
      }

      let result: unknown;

      try {
        result = await evaluator.evaluate(context);
      } catch {
        return policyError('evaluator-failed', {
          path,
          referenceId: declaration.evaluatorId,
          declarationKind: declaration.kind,
        });
      }

      const canonicalized = canonicalizePolicyResult(result);
      if (!canonicalized) {
        return policyError('invalid-result', {
          path,
          referenceId: declaration.evaluatorId,
          declarationKind: declaration.kind,
        });
      }

      return canonicalized;
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
            declaringOwner,
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
  const error: PolicyErrorDetail = (() => {
    const base = { code };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = { ...base };

    if (typeof detail.path === 'string' && detail.path.length > 0 && detail.path.length < 512) {
      result.path = detail.path;
    }

    if (typeof detail.owner === 'string' && isValidOwnerId(detail.owner)) {
      result.owner = detail.owner;
    }

    if (
      typeof detail.referenceId === 'string' &&
      detail.referenceId.length > 0 &&
      detail.referenceId.length < 256
    ) {
      result.referenceId = detail.referenceId;
    }

    if (detail.declarationKind !== undefined && isValidDeclarationKind(detail.declarationKind)) {
      result.declarationKind = detail.declarationKind;
    }

    return result as PolicyErrorDetail;
  })();

  return {
    kind: 'policy-error',
    error,
  };
}

function invalidIssue(
  code: PolicyErrorCode,
  path: string,
  declarationKind: AccessDeclaration['kind']
): PolicyValidationIssue {
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
): PolicyValidationIssue {
  return {
    code: 'missing-runtime-reference',
    path,
    referenceId,
    declarationKind,
  };
}

function canonicalizePolicyResult(value: unknown): PolicyResult | null {
  try {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }

    // Check 'kind' descriptor before accessing
    const kindDescriptor = Object.getOwnPropertyDescriptor(value, 'kind');
    if (!kindDescriptor || kindDescriptor.get || kindDescriptor.set || !kindDescriptor.enumerable) {
      return null;
    }

    const kind = kindDescriptor.value;

    if (!VALID_POLICY_RESULT_KINDS.has(kind as PolicyResultKind)) {
      return null;
    }

    if (kind === 'allow') {
      return allowResult;
    }

    if (kind === 'unauthenticated') {
      return unauthenticatedResult;
    }

    if (kind === 'forbidden') {
      return forbiddenResult;
    }

    if (kind === 'not-found') {
      return notFoundResult;
    }

    if (kind === 'policy-error') {
      // Check 'error' descriptor before accessing
      const errorDescriptor = Object.getOwnPropertyDescriptor(value, 'error');
      if (
        !errorDescriptor ||
        errorDescriptor.get ||
        errorDescriptor.set ||
        !errorDescriptor.enumerable
      ) {
        return null;
      }

      const error = errorDescriptor.value;

      if (typeof error !== 'object' || error === null) {
        return null;
      }

      const errorPrototype = Object.getPrototypeOf(error);
      if (errorPrototype !== Object.prototype && errorPrototype !== null) {
        return null;
      }

      // Check 'code' descriptor before accessing
      const codeDescriptor = Object.getOwnPropertyDescriptor(error, 'code');
      if (
        !codeDescriptor ||
        codeDescriptor.get ||
        codeDescriptor.set ||
        !codeDescriptor.enumerable
      ) {
        return null;
      }

      const errorCode = codeDescriptor.value;
      if (!VALID_POLICY_ERROR_CODES.has(errorCode as PolicyErrorCode)) {
        return null;
      }

      // Check other optional fields - they must be data properties if present
      let path: unknown = undefined;
      const pathDescriptor = Object.getOwnPropertyDescriptor(error, 'path');
      if (pathDescriptor) {
        if (pathDescriptor.get || pathDescriptor.set || !pathDescriptor.enumerable) {
          return null;
        }
        path = pathDescriptor.value;
      }

      let owner: unknown = undefined;
      const ownerDescriptor = Object.getOwnPropertyDescriptor(error, 'owner');
      if (ownerDescriptor) {
        if (ownerDescriptor.get || ownerDescriptor.set || !ownerDescriptor.enumerable) {
          return null;
        }
        owner = ownerDescriptor.value;
      }

      let referenceId: unknown = undefined;
      const refIdDescriptor = Object.getOwnPropertyDescriptor(error, 'referenceId');
      if (refIdDescriptor) {
        if (refIdDescriptor.get || refIdDescriptor.set || !refIdDescriptor.enumerable) {
          return null;
        }
        referenceId = refIdDescriptor.value;
      }

      let declarationKind: unknown = undefined;
      const declKindDescriptor = Object.getOwnPropertyDescriptor(error, 'declarationKind');
      if (declKindDescriptor) {
        if (declKindDescriptor.get || declKindDescriptor.set || !declKindDescriptor.enumerable) {
          return null;
        }
        declarationKind = declKindDescriptor.value;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitizedErrorObj: Record<string, any> = {
        code: errorCode as PolicyErrorCode,
      };

      if (typeof path === 'string' && path.length > 0 && path.length < 512) {
        sanitizedErrorObj.path = path;
      }

      if (typeof owner === 'string' && isValidOwnerId(owner)) {
        sanitizedErrorObj.owner = owner as OwnerId;
      }

      if (typeof referenceId === 'string' && referenceId.length > 0 && referenceId.length < 256) {
        sanitizedErrorObj.referenceId = referenceId;
      }

      if (isValidDeclarationKind(declarationKind)) {
        sanitizedErrorObj.declarationKind = declarationKind as AccessDeclaration['kind'];
      }

      return {
        kind: 'policy-error',
        error: sanitizedErrorObj as PolicyErrorDetail,
      };
    }

    return null;
  } catch {
    // Fail closed on any unexpected error during canonicalization
    return null;
  }
}

function isValidOwnerId(value: unknown): value is OwnerId {
  if (typeof value !== 'string') {
    return false;
  }

  if (value === 'framework' || value === 'site') {
    return true;
  }

  if (value.startsWith('plugin:')) {
    const pluginId = value.slice(7);
    return pluginId.length > 0 && pluginId.length < 128 && /^[a-z0-9_-]+$/i.test(pluginId);
  }

  return false;
}

function isValidDeclarationKind(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return [
    'everyone',
    'anonymous-only',
    'authenticated',
    'role-any',
    'permission-any',
    'ownership',
    'custom',
    'allOf',
    'anyOf',
  ].includes(value);
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
