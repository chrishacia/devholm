import { ZodError } from 'zod';

type ErrorLike = {
  code?: string;
  message?: string;
};

export class UrlShortenerValidationError extends Error {
  constructor(message = 'Invalid URL shortener payload') {
    super(message);
    this.name = 'UrlShortenerValidationError';
  }
}

export class UrlShortenerConflictError extends Error {
  public readonly conflictCode: string;

  constructor(message = 'URL shortener conflict', conflictCode = 'URL_SHORTENER_CONFLICT') {
    super(message);
    this.name = 'UrlShortenerConflictError';
    this.conflictCode = conflictCode;
  }
}

export class UrlShortenerNotFoundError extends Error {
  constructor(message = 'URL shortener resource not found') {
    super(message);
    this.name = 'UrlShortenerNotFoundError';
  }
}

export class UrlShortenerInvalidTransitionError extends Error {
  constructor(message = 'Invalid URL shortener state transition') {
    super(message);
    this.name = 'UrlShortenerInvalidTransitionError';
  }
}

export class UrlShortenerOperationalError extends Error {
  constructor(message = 'URL shortener operation failed') {
    super(message);
    this.name = 'UrlShortenerOperationalError';
  }
}

export function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as ErrorLike).code === '23505';
}

export type UrlShortenerHttpError = {
  status: number;
  body: {
    error: string;
    code?: string;
  };
};

export function mapPublicSubmissionCreateError(error: unknown): UrlShortenerHttpError {
  if (error instanceof UrlShortenerValidationError || error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Invalid public submission payload',
        code: 'INVALID_SUBMISSION',
      },
    };
  }

  if (error instanceof UrlShortenerConflictError || isUniqueViolationError(error)) {
    return {
      status: 409,
      body: {
        error: 'Duplicate short code',
        code: 'DUPLICATE_SHORT_CODE',
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'Failed to process public submission',
      code: 'URL_SHORTENER_OPERATIONAL_ERROR',
    },
  };
}

export function mapPublicSubmissionReviewError(error: unknown): UrlShortenerHttpError {
  if (error instanceof UrlShortenerValidationError || error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Invalid submission review payload',
        code: 'INVALID_SUBMISSION_REVIEW',
      },
    };
  }

  if (error instanceof UrlShortenerNotFoundError) {
    return {
      status: 404,
      body: {
        error: 'Submission not found',
        code: 'SUBMISSION_NOT_FOUND',
      },
    };
  }

  if (error instanceof UrlShortenerInvalidTransitionError) {
    return {
      status: 409,
      body: {
        error: 'Submission review is already finalized',
        code: 'INVALID_SUBMISSION_STATE',
      },
    };
  }

  if (error instanceof UrlShortenerConflictError || isUniqueViolationError(error)) {
    return {
      status: 409,
      body: {
        error: 'Duplicate short code',
        code: 'DUPLICATE_SHORT_CODE',
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'Failed to review public submission',
      code: 'URL_SHORTENER_OPERATIONAL_ERROR',
    },
  };
}
