type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function getFallbackGithubApiToken(): string {
  return (
    process.env.DEVHOLM_TEMPLATE_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  ).trim();
}

function resolveGithubApiToken(explicitToken?: string | null): string {
  const explicit = (explicitToken || '').trim();
  return explicit || getFallbackGithubApiToken();
}

function buildGithubHeaders(explicitToken?: string | null): HeadersInit {
  const token = resolveGithubApiToken(explicitToken);
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devholm-admin-updates',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function hasGithubApiToken(explicitToken?: string | null): boolean {
  return Boolean(resolveGithubApiToken(explicitToken));
}

export interface GithubRepoInfo {
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export async function fetchGithubRepoInfo(
  repo: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<GithubRepoInfo | null> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}`, {
    headers: buildGithubHeaders(explicitToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const fullName = typeof payload.full_name === 'string' ? payload.full_name : repo;
  const htmlUrl =
    typeof payload.html_url === 'string' ? payload.html_url : `https://github.com/${fullName}`;
  const defaultBranch =
    typeof payload.default_branch === 'string' ? payload.default_branch : 'main';
  const isPrivate = Boolean(payload.private);

  return {
    fullName,
    htmlUrl,
    defaultBranch,
    isPrivate,
  };
}

export async function dispatchWorkflow(
  repo: string,
  workflow: string,
  ref: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<boolean> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        ...buildGithubHeaders(explicitToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref }),
      cache: 'no-store',
    }
  );

  return response.ok;
}

export interface WorkflowRunInfo {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  title: string;
  event: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
}

function mapRun(payload: Record<string, unknown>): WorkflowRunInfo {
  return {
    id: Number(payload.id),
    status: typeof payload.status === 'string' ? payload.status : 'unknown',
    conclusion: typeof payload.conclusion === 'string' ? payload.conclusion : null,
    htmlUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
    title: typeof payload.display_title === 'string' ? payload.display_title : 'Workflow Run',
    event: typeof payload.event === 'string' ? payload.event : '',
    branch: typeof payload.head_branch === 'string' ? payload.head_branch : '',
    createdAt: typeof payload.created_at === 'string' ? payload.created_at : '',
    updatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : '',
  };
}

export async function fetchWorkflowRun(
  repo: string,
  runId: number,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<WorkflowRunInfo | null> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs/${runId}`, {
    headers: buildGithubHeaders(explicitToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return mapRun(payload);
}

export interface WorkflowJobInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export async function fetchWorkflowJobs(
  repo: string,
  runId: number,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<WorkflowJobInfo[]> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
    {
      headers: buildGithubHeaders(explicitToken),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  return jobs.map((job) => {
    const value = job as Record<string, unknown>;
    return {
      id: Number(value.id),
      name: typeof value.name === 'string' ? value.name : 'Job',
      status: typeof value.status === 'string' ? value.status : 'unknown',
      conclusion: typeof value.conclusion === 'string' ? value.conclusion : null,
    };
  });
}

export async function fetchLatestDispatchedRun(
  repo: string,
  workflow: string,
  branch: string,
  fetchImpl: FetchLike = fetch,
  explicitToken?: string | null
): Promise<WorkflowRunInfo | null> {
  const endpoint = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=1`;
  const response = await fetchImpl(endpoint, {
    headers: buildGithubHeaders(explicitToken),
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  if (runs.length === 0) {
    return null;
  }

  return mapRun(runs[0] as Record<string, unknown>);
}
