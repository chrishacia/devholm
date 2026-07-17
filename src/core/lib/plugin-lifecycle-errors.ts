export type LifecycleRecoveryClassification =
  | 'retryable'
  | 'manual-intervention-required'
  | 'reconcile-on-restart'
  | 'blocked-policy';

export type LifecycleErrorCode =
  | 'LIFECYCLE_INVALID_TRANSITION'
  | 'LIFECYCLE_UNAUTHORIZED'
  | 'LIFECYCLE_APPROVAL_REQUIRED'
  | 'LIFECYCLE_OPERATION_CONFLICT'
  | 'LIFECYCLE_STALE_OPERATION'
  | 'LIFECYCLE_TRUST_BLOCKED'
  | 'LIFECYCLE_INCOMPATIBLE'
  | 'LIFECYCLE_CONFIGURATION_MISSING'
  | 'LIFECYCLE_ARTIFACT_UNAVAILABLE'
  | 'LIFECYCLE_BUILD_REQUIRED'
  | 'LIFECYCLE_BUILD_FAILED'
  | 'LIFECYCLE_DEPLOYMENT_REQUIRED'
  | 'LIFECYCLE_DEPLOYMENT_FAILED'
  | 'LIFECYCLE_MIGRATION_BLOCKED'
  | 'LIFECYCLE_MIGRATION_FAILED'
  | 'LIFECYCLE_ACTIVATION_FAILED'
  | 'LIFECYCLE_ROLLBACK_UNAVAILABLE'
  | 'LIFECYCLE_ROLLBACK_UNSAFE'
  | 'LIFECYCLE_RECOVERY_REQUIRED'
  | 'LIFECYCLE_INFRASTRUCTURE_UNAVAILABLE'
  | 'LIFECYCLE_INTERNAL_INVARIANT';

type LifecycleErrorDefinition = {
  httpStatus: number;
  publicMessage: string;
  retryable: boolean;
  recoveryClassification: LifecycleRecoveryClassification;
};

const LIFECYCLE_ERROR_DEFINITIONS: Record<LifecycleErrorCode, LifecycleErrorDefinition> = {
  LIFECYCLE_INVALID_TRANSITION: {
    httpStatus: 409,
    publicMessage: 'Requested lifecycle transition is not valid for the current plugin state.',
    retryable: false,
    recoveryClassification: 'blocked-policy',
  },
  LIFECYCLE_UNAUTHORIZED: {
    httpStatus: 403,
    publicMessage: 'You are not authorized to execute this lifecycle operation.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_APPROVAL_REQUIRED: {
    httpStatus: 409,
    publicMessage: 'Lifecycle operation requires explicit approval before execution.',
    retryable: false,
    recoveryClassification: 'blocked-policy',
  },
  LIFECYCLE_OPERATION_CONFLICT: {
    httpStatus: 409,
    publicMessage: 'Another lifecycle operation is already running for this plugin.',
    retryable: true,
    recoveryClassification: 'retryable',
  },
  LIFECYCLE_STALE_OPERATION: {
    httpStatus: 409,
    publicMessage: 'Lifecycle operation is stale and requires reconciliation before retry.',
    retryable: true,
    recoveryClassification: 'reconcile-on-restart',
  },
  LIFECYCLE_TRUST_BLOCKED: {
    httpStatus: 409,
    publicMessage: 'Lifecycle operation is blocked by trust policy.',
    retryable: false,
    recoveryClassification: 'blocked-policy',
  },
  LIFECYCLE_INCOMPATIBLE: {
    httpStatus: 409,
    publicMessage: 'Plugin is incompatible with the current platform constraints.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_CONFIGURATION_MISSING: {
    httpStatus: 409,
    publicMessage: 'Required plugin configuration is missing.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_ARTIFACT_UNAVAILABLE: {
    httpStatus: 409,
    publicMessage: 'Required plugin artifact is unavailable.',
    retryable: true,
    recoveryClassification: 'retryable',
  },
  LIFECYCLE_BUILD_REQUIRED: {
    httpStatus: 409,
    publicMessage: 'Build inclusion must complete before this lifecycle operation.',
    retryable: true,
    recoveryClassification: 'retryable',
  },
  LIFECYCLE_BUILD_FAILED: {
    httpStatus: 409,
    publicMessage: 'Plugin build failed and must be repaired before continuing.',
    retryable: true,
    recoveryClassification: 'reconcile-on-restart',
  },
  LIFECYCLE_DEPLOYMENT_REQUIRED: {
    httpStatus: 409,
    publicMessage: 'Deployment must complete before this lifecycle operation.',
    retryable: true,
    recoveryClassification: 'retryable',
  },
  LIFECYCLE_DEPLOYMENT_FAILED: {
    httpStatus: 409,
    publicMessage: 'Plugin deployment failed and requires recovery.',
    retryable: true,
    recoveryClassification: 'reconcile-on-restart',
  },
  LIFECYCLE_MIGRATION_BLOCKED: {
    httpStatus: 409,
    publicMessage: 'Migration policy blocks this lifecycle operation.',
    retryable: false,
    recoveryClassification: 'blocked-policy',
  },
  LIFECYCLE_MIGRATION_FAILED: {
    httpStatus: 409,
    publicMessage: 'Plugin migration failed and requires recovery.',
    retryable: true,
    recoveryClassification: 'reconcile-on-restart',
  },
  LIFECYCLE_ACTIVATION_FAILED: {
    httpStatus: 409,
    publicMessage: 'Plugin activation failed and requires recovery.',
    retryable: true,
    recoveryClassification: 'reconcile-on-restart',
  },
  LIFECYCLE_ROLLBACK_UNAVAILABLE: {
    httpStatus: 409,
    publicMessage: 'Rollback is not currently available for this plugin.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_ROLLBACK_UNSAFE: {
    httpStatus: 409,
    publicMessage: 'Rollback was blocked because safety checks failed.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_RECOVERY_REQUIRED: {
    httpStatus: 409,
    publicMessage: 'Lifecycle state is ambiguous and requires explicit recovery.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
  LIFECYCLE_INFRASTRUCTURE_UNAVAILABLE: {
    httpStatus: 503,
    publicMessage: 'Lifecycle infrastructure is temporarily unavailable.',
    retryable: true,
    recoveryClassification: 'retryable',
  },
  LIFECYCLE_INTERNAL_INVARIANT: {
    httpStatus: 500,
    publicMessage: 'Lifecycle invariant violation detected; operation was not completed.',
    retryable: false,
    recoveryClassification: 'manual-intervention-required',
  },
};

export class PluginLifecycleError extends Error {
  readonly code: LifecycleErrorCode;
  readonly publicMessage: string;
  readonly internalDiagnostic?: string;
  readonly retryable: boolean;
  readonly recoveryClassification: LifecycleRecoveryClassification;
  readonly httpStatus: number;

  constructor(input: {
    code: LifecycleErrorCode;
    internalDiagnostic?: string;
    publicMessageOverride?: string;
  }) {
    const definition = LIFECYCLE_ERROR_DEFINITIONS[input.code];
    super(input.internalDiagnostic ?? definition.publicMessage);
    this.name = 'PluginLifecycleError';
    this.code = input.code;
    this.internalDiagnostic = input.internalDiagnostic;
    this.publicMessage = input.publicMessageOverride ?? definition.publicMessage;
    this.retryable = definition.retryable;
    this.recoveryClassification = definition.recoveryClassification;
    this.httpStatus = definition.httpStatus;
  }
}

export function mapUnknownLifecycleError(error: unknown): PluginLifecycleError {
  if (error instanceof PluginLifecycleError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('Unknown plugin')) {
    return new PluginLifecycleError({
      code: 'LIFECYCLE_INVALID_TRANSITION',
      internalDiagnostic: message,
      publicMessageOverride: message,
    });
  }

  if (message.includes('already in progress') || message.includes('pending lifecycle operation')) {
    return new PluginLifecycleError({
      code: 'LIFECYCLE_OPERATION_CONFLICT',
      internalDiagnostic: message,
    });
  }

  if (message.includes('not installed') || message.includes('requires it')) {
    return new PluginLifecycleError({
      code: 'LIFECYCLE_INVALID_TRANSITION',
      internalDiagnostic: message,
      publicMessageOverride: message,
    });
  }

  return new PluginLifecycleError({
    code: 'LIFECYCLE_INTERNAL_INVARIANT',
    internalDiagnostic: message,
  });
}
