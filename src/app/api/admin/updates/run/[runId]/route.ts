import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, rateLimitHeaders, RateLimits } from '@/lib/rate-limiter';
import { verifyAdmin } from '@/lib/auth-helpers';
import { fetchWorkflowJobs, fetchWorkflowRun } from '@/lib/github-actions';
import { getGithubUpdatesTokenFromDb } from '@/lib/github-updates-config';

function getSiteRepo(): string {
  return (process.env.DEVHOLM_SITE_REPO || process.env.GITHUB_REPOSITORY || '').trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    action: 'admin-updates-run-status',
    identifier: getClientIp(request),
    ...RateLimits.ADMIN_API,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const { runId: rawRunId } = await params;
  const runId = Number(rawRunId);

  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json(
      { error: 'Invalid run id' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const siteRepo = getSiteRepo();
  if (!siteRepo) {
    return NextResponse.json(
      { error: 'Site repository is not configured.' },
      { status: 400, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const dbToken = await getGithubUpdatesTokenFromDb();

  const run = await fetchWorkflowRun(siteRepo, runId, fetch, dbToken);

  if (!run) {
    return NextResponse.json(
      { error: 'Workflow run not found.' },
      { status: 404, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const jobs = await fetchWorkflowJobs(siteRepo, runId, fetch, dbToken);
  const activeJob = jobs.find((job) => job.status === 'in_progress');
  const failedJob = jobs.find((job) => job.conclusion === 'failure');

  return NextResponse.json(
    {
      data: {
        run,
        jobs,
        summary: {
          activeJob: activeJob?.name ?? null,
          failedJob: failedJob?.name ?? null,
          completed: run.status === 'completed',
        },
      },
    },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
