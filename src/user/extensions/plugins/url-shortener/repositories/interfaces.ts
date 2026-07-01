import type { Knex } from 'knex';

export interface LinkRepository {
  getByCode(code: string): Promise<unknown | null>;
  create(input: { code: string; destinationUrl: string; title?: string }): Promise<unknown>;
}

export interface ClickEventRepository {
  record(input: {
    linkId: string;
    referrerDomain?: string | null;
    userAgentCategory?: string | null;
    countryCode?: string | null;
  }): Promise<void>;
}

export interface DailyStatsRepository {
  upsertDailyStats(input: {
    linkId: string;
    date: string;
    totalClicks: number;
    referrerCategory?: string | null;
    deviceCategory?: string | null;
  }): Promise<void>;
}

export interface SubmissionRepository {
  createSubmission(input: {
    requestedDestination: string;
    requestedCode?: string;
    requesterLabel?: string;
  }): Promise<unknown>;
}

export interface AuditRepository {
  appendRecord(input: {
    actionType: string;
    targetType: string;
    targetId?: string | null;
    actorType?: string | null;
    actorId?: string | null;
    actorLabel?: string | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    requestId?: string | null;
  }): Promise<void>;
}

export interface PrefixAliasRepository {
  createAlias(input: { prefix: string; isActive: boolean; reason?: string | null }): Promise<void>;
}

export interface UrlShortenerRepositoryContext {
  db: Knex;
}
