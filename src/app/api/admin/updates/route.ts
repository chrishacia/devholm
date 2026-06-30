import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';
import { getUpdateStatus } from '@/lib/update-status';
import {
  dispatchWorkflow,
  fetchGithubRepoInfo,
  fetchLatestDispatchedRun,
  hasGithubApiToken,
} from '@/lib/github-actions';
import {
  getGithubUpdatesConfig,
  getGithubUpdatesTokenFromDb,
  toPublicGithubUpdatesConfig,
} from '@/lib/github-updates-config';

function getTemplateRepo(): string {
  return process.env.DEVHOLM_TEMPLATE_REPO || 'chrishacia/devholm';
}

function getSiteRepo(): string {
  return (process.env.DEVHOLM_SITE_REPO || process.env.GITHUB_REPOSITORY || '').trim();
}

function getUpdateWorkflowFile(): string {
  return (process.env.DEVHOLM_UPDATE_WORKFLOW_FILE || 'ci.yml').trim();
}

function getUpdateWorkflowRef(): string {
  return (process.env.DEVHOLM_UPDATE_WORKFLOW_REF || 'main').trim();
}

export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-updates',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const sourceRepo = getTemplateRepo();
  const siteRepo = getSiteRepo();
  const workflowFile = getUpdateWorkflowFile();
  const workflowRef = getUpdateWorkflowRef();
  const tokenConfig = await getGithubUpdatesConfig();
  const dbToken = await getGithubUpdatesTokenFromDb();
  const tokenForGithub = dbToken;

  const status = await getUpdateStatus(sourceRepo, fetch, tokenForGithub);
  const siteRepoInfo = siteRepo ? await fetchGithubRepoInfo(siteRepo, fetch, tokenForGithub) : null;

  const canTriggerUpdate = Boolean(siteRepoInfo && hasGithubApiToken(tokenForGithub));
  const capabilityWarning = !hasGithubApiToken(tokenForGithub)
    ? 'GitHub API token is not configured for update actions.'
    : !siteRepo
      ? 'Site repository is not configured (set DEVHOLM_SITE_REPO to enable one-click updates).'
      : !siteRepoInfo
        ? 'Unable to load site repository metadata for update actions.'
        : undefined;

  return NextResponse.json(
    {
      data: {
        ...status,
        automation: {
          siteRepo,
          workflowFile,
          workflowRef,
          repoPrivate: siteRepoInfo?.isPrivate ?? null,
          canTriggerUpdate,
          warning: capabilityWarning,
          token: toPublicGithubUpdatesConfig(tokenConfig),
        },
      },
    },
    { headers: rateLimitHeaders(rateLimit) }
  );
}

export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-updates-run',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const siteRepo = getSiteRepo();
  const workflowFile = getUpdateWorkflowFile();
  const workflowRef = getUpdateWorkflowRef();
  const dbToken = await getGithubUpdatesTokenFromDb();

  if (!siteRepo) {
    return NextResponse.json(
      { error: 'Site repository is not configured. Set DEVHOLM_SITE_REPO.' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  if (!hasGithubApiToken(dbToken)) {
    return NextResponse.json(
      { error: 'GitHub API token is not configured for update actions.' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const dispatched = await dispatchWorkflow(siteRepo, workflowFile, workflowRef, fetch, dbToken);

  if (!dispatched) {
    return NextResponse.json(
      { error: 'Failed to dispatch update workflow.' },
      { status: 500, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const latestRun = await fetchLatestDispatchedRun(
    siteRepo,
    workflowFile,
    workflowRef,
    fetch,
    dbToken
  );

  return NextResponse.json(
    {
      data: {
        dispatched: true,
        siteRepo,
        workflowFile,
        workflowRef,
        runId: latestRun?.id ?? null,
        runUrl: latestRun?.htmlUrl ?? null,
      },
    },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
