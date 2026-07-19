import type { ApiExtension } from '@core/types/extensions.server';
import type { NextRequest } from 'next/server';
import { verifyPermission } from '@/lib/auth-helpers';
import {
  URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
  URL_SHORTENER_PERMISSION_ADMIN_MANAGE,
  URL_SHORTENER_PLUGIN_ID,
} from '@user/extensions/plugins/url-shortener/constants';

import {
  createUrlShortenerPublicSubmission,
  createUrlShortenerLink,
  deleteUrlShortenerLink,
  getUrlShortenerLinkByCode,
  getUrlShortenerOverview,
  getUrlShortenerSettings,
  listUrlShortenerPublicSubmissions,
  listUrlShortenerLinks,
  reviewUrlShortenerPublicSubmission,
  updateUrlShortenerLink,
  updateUrlShortenerSettings,
} from '@user/extensions/plugins/url-shortener/services/url-shortener-store';
import {
  createShortLinkInputSchema,
  publicCreationModeSchema,
  shortCodeSchema,
} from '@user/extensions/plugins/url-shortener/validation/schemas';
import { validateRoutePrefix } from '@user/extensions/plugins/url-shortener/validation/prefix-validation';

const MANAGE_PERMISSION = 'plugin:url-shortener:manage';

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>;
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries()) as Record<string, unknown>;
  }

  return {};
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value.toLowerCase() === 'on';
  }

  return undefined;
}

function parseDateOrNull(value: unknown): string | Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  return undefined;
}

function responseForNotFound(message: string): Response {
  return json({ error: message }, { status: 404 });
}

async function requireManageAccess(request: NextRequest) {
  return verifyPermission(request, MANAGE_PERMISSION);
}

function segmentAt(path: string[], index: number): string | undefined {
  return path[index];
}

async function handleLinksGET(path: string[]): Promise<Response> {
  if (path.length === 2) {
    const code = shortCodeSchema.safeParse(segmentAt(path, 1));
    if (!code.success) {
      return responseForNotFound('Invalid short code');
    }

    const link = await getUrlShortenerLinkByCode(code.data);
    if (!link) {
      return responseForNotFound('Link not found');
    }

    return json({ link });
  }

  return json({ links: await listUrlShortenerLinks() });
}

async function handleLinksPOST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const parsed = createShortLinkInputSchema.safeParse({
    code: body.code,
    destinationUrl: body.destinationUrl,
    title: body.title,
  });

  if (!parsed.success) {
    return json(
      { error: 'Invalid short link payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const link = await createUrlShortenerLink({
    code: parsed.data.code,
    destinationUrl: parsed.data.destinationUrl,
    title: parsed.data.title,
    redirectStatusCode: Number(body.redirectStatusCode ?? 302),
    expiresAt: parseDateOrNull(body.expiresAt),
    creatorType: typeof body.creatorType === 'string' ? body.creatorType : 'admin',
    creatorId: typeof body.creatorId === 'string' ? body.creatorId : null,
    creatorLabel: typeof body.creatorLabel === 'string' ? body.creatorLabel : null,
  });

  return json({ link }, { status: 201 });
}

async function handleLinkMutation(
  method: 'PATCH' | 'DELETE',
  path: string[],
  request: Request
): Promise<Response> {
  const code = shortCodeSchema.safeParse(segmentAt(path, 1));
  if (!code.success) {
    return responseForNotFound('Invalid short code');
  }

  if (method === 'DELETE') {
    const link = await deleteUrlShortenerLink(code.data);
    if (!link) {
      return responseForNotFound('Link not found');
    }

    return json({ link });
  }

  const body = await parseBody(request);
  const link = await updateUrlShortenerLink(code.data, {
    destinationUrl: typeof body.destinationUrl === 'string' ? body.destinationUrl : undefined,
    title: typeof body.title === 'string' ? body.title : body.title === null ? null : undefined,
    redirectStatusCode:
      body.redirectStatusCode === undefined ? undefined : Number(body.redirectStatusCode),
    expiresAt: parseDateOrNull(body.expiresAt),
    isActive: parseBoolean(body.isActive),
  });

  if (!link) {
    return responseForNotFound('Link not found');
  }

  return json({ link });
}

async function handleSettingsGET(): Promise<Response> {
  return json({ settings: await getUrlShortenerSettings() });
}

async function handleSettingsPATCH(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const routePrefixRaw = body.routePrefix;
  const publicCreationModeRaw = body.publicCreationMode;

  let routePrefix: string | undefined;
  if (routePrefixRaw !== undefined) {
    try {
      routePrefix = validateRoutePrefix(String(routePrefixRaw));
    } catch {
      return json(
        {
          error: 'Invalid settings payload',
          details: { routePrefix: ['Invalid route prefix'] },
        },
        { status: 400 }
      );
    }
  }

  const publicCreationMode =
    publicCreationModeRaw === undefined
      ? undefined
      : publicCreationModeSchema.safeParse(String(publicCreationModeRaw));
  if (publicCreationMode && !publicCreationMode.success) {
    return json(
      {
        error: 'Invalid settings payload',
        details: { publicCreationMode: ['Invalid public creation mode'] },
      },
      { status: 400 }
    );
  }

  const legacyPrefixEnabled = parseBoolean(body.legacyPrefixEnabled);

  const settings = await updateUrlShortenerSettings({
    routePrefix,
    publicCreationMode: publicCreationMode?.data as
      | 'admin-only'
      | 'authenticated'
      | 'public-with-approval'
      | undefined,
    legacyPrefixEnabled,
  });

  return json({ settings });
}

async function handleOverviewGET(): Promise<Response> {
  return json({ overview: await getUrlShortenerOverview() });
}

async function handleAnalyticsGET(): Promise<Response> {
  return json({ overview: await getUrlShortenerOverview() });
}

async function handlePublicSubmissionsGET(): Promise<Response> {
  return json({ submissions: await listUrlShortenerPublicSubmissions() });
}

async function handlePublicSubmissionsPOST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (typeof body.destinationUrl !== 'string') {
    return json(
      {
        error: 'Invalid public submission payload',
        details: { destinationUrl: ['Destination URL is required'] },
      },
      { status: 400 }
    );
  }

  let submission;
  try {
    submission = await createUrlShortenerPublicSubmission({
      destinationUrl: body.destinationUrl,
      requestedCode: typeof body.requestedCode === 'string' ? body.requestedCode : undefined,
      requesterType: typeof body.requesterType === 'string' ? body.requesterType : 'admin',
      requesterId: typeof body.requesterId === 'string' ? body.requesterId : null,
      requesterLabel: typeof body.requesterLabel === 'string' ? body.requesterLabel : null,
    });
  } catch {
    return json(
      {
        error: 'Invalid public submission payload',
      },
      { status: 400 }
    );
  }

  return json({ submission }, { status: 201 });
}

async function handlePublicSubmissionReviewPATCH(
  path: string[],
  request: Request
): Promise<Response> {
  const submissionId = segmentAt(path, 1);
  if (!submissionId) {
    return responseForNotFound('Submission not found');
  }

  const body = await parseBody(request);
  const decision =
    body.decision === 'approved' || body.decision === 'rejected' ? body.decision : null;
  if (!decision) {
    return json(
      {
        error: 'Invalid submission review payload',
        details: { decision: ['Must be approved or rejected'] },
      },
      { status: 400 }
    );
  }

  const result = await reviewUrlShortenerPublicSubmission(submissionId, {
    decision,
    reviewNotes: typeof body.reviewNotes === 'string' ? body.reviewNotes : null,
    title: typeof body.title === 'string' ? body.title : null,
    codeOverride: typeof body.codeOverride === 'string' ? body.codeOverride : undefined,
    reviewerType: typeof body.reviewerType === 'string' ? body.reviewerType : 'admin',
    reviewerId: typeof body.reviewerId === 'string' ? body.reviewerId : null,
    reviewerLabel: typeof body.reviewerLabel === 'string' ? body.reviewerLabel : null,
  });

  if (!result) {
    return responseForNotFound('Submission not found');
  }

  return json(result);
}

export const urlShortenerApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: URL_SHORTENER_PLUGIN_ID,
    path: '/api/url-shortener',
    accessPolicy: {
      scope: 'admin',
      capability: URL_SHORTENER_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [URL_SHORTENER_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'URL shortener API runtime executes in plugin extension module context.',
    },
    handlers: {
      GET: async (request, context) => {
        const token = await requireManageAccess(request);
        if (!token) {
          return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const path = context.params.path.slice(1);
        switch (segmentAt(path, 0)) {
          case 'overview':
            return handleOverviewGET();
          case 'analytics':
            return handleAnalyticsGET();
          case 'settings':
            return handleSettingsGET();
          case 'links':
            return handleLinksGET(path);
          case 'public-submissions':
            return handlePublicSubmissionsGET();
          default:
            return responseForNotFound('Unknown URL shortener API endpoint');
        }
      },
      POST: async (request, context) => {
        const token = await requireManageAccess(request);
        if (!token) {
          return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const path = context.params.path.slice(1);
        if (segmentAt(path, 0) === 'links' && path.length === 1) {
          return handleLinksPOST(request);
        }

        if (segmentAt(path, 0) === 'public-submissions' && path.length === 1) {
          return handlePublicSubmissionsPOST(request);
        }

        return responseForNotFound('Unknown URL shortener API endpoint');
      },
      PATCH: async (request, context) => {
        const token = await requireManageAccess(request);
        if (!token) {
          return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const path = context.params.path.slice(1);
        if (segmentAt(path, 0) === 'settings') {
          return handleSettingsPATCH(request);
        }

        if (segmentAt(path, 0) === 'links') {
          return handleLinkMutation('PATCH', path, request);
        }

        if (segmentAt(path, 0) === 'public-submissions') {
          return handlePublicSubmissionReviewPATCH(path, request);
        }

        return responseForNotFound('Unknown URL shortener API endpoint');
      },
      DELETE: async (request, context) => {
        const token = await requireManageAccess(request);
        if (!token) {
          return json({ error: 'Unauthorized' }, { status: 401 });
        }

        const path = context.params.path.slice(1);
        if (segmentAt(path, 0) === 'links') {
          return handleLinkMutation('DELETE', path, request);
        }

        return responseForNotFound('Unknown URL shortener API endpoint');
      },
    },
  },
];
