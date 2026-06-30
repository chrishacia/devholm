import crypto from 'crypto';
import { getDb } from './index';
import { getSettings, updateSettings, upsertSetting } from './settings';
import { auth as authConfig } from '@/config/env';
import { decryptSecret, encryptSecret } from '@/lib/secret-store';
import type {
  AuthManagementUser,
  AuthInvitationSummary,
  AuthOnboardingStatus,
  AuthInvitation,
  AuthProviderConfig,
  AuthProviderCredentialSet,
  AuthRoleWithPermissions,
  AuthProviderSummary,
  AuthSettings,
  PublicAuthInvitation,
  AuthSubject,
  AuthUser,
  LinkedAuthAccount,
  LinkedAuthAccountSummary,
  SiteUser,
} from '@/types';

const SYSTEM_PROVIDER_DEFINITIONS: AuthProviderSummary[] = [
  {
    provider: 'google',
    label: 'Google',
    enabled: false,
    clientIdConfigured: false,
    clientSecretConfigured: false,
    scopes: ['openid', 'email', 'profile'],
  },
  {
    provider: 'github',
    label: 'GitHub',
    enabled: false,
    clientIdConfigured: false,
    clientSecretConfigured: false,
    scopes: ['read:user', 'user:email'],
  },
  {
    provider: 'discord',
    label: 'Discord',
    enabled: false,
    clientIdConfigured: false,
    clientSecretConfigured: false,
    scopes: ['identify', 'email'],
  },
];

const ADMIN_ROLE_SLUGS = new Set(['superadmin', 'admin']);

let authTablesAvailable: boolean | null = null;

const DEFAULT_INVITE_TTL_HOURS = 72;

function isMissingRelationError(error: unknown): boolean {
  return error instanceof Error && /does not exist/.test(error.message);
}

async function hasAuthTables(): Promise<boolean> {
  if (authTablesAvailable !== null) {
    return authTablesAvailable;
  }

  try {
    await getDb()('site_users').count<{ count: string }[]>('* as count');
    authTablesAvailable = true;
  } catch (error) {
    if (isMissingRelationError(error)) {
      authTablesAvailable = false;
      return false;
    }
    throw error;
  }

  return authTablesAvailable;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createInviteToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function hashInviteToken(token: string): string {
  return crypto.createHmac('sha256', authConfig.secret).update(token).digest('hex');
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function getDefaultProviderSummary(provider: string): AuthProviderSummary {
  return (
    SYSTEM_PROVIDER_DEFINITIONS.find((entry) => entry.provider === provider) ?? {
      provider,
      label: provider,
      enabled: false,
      clientIdConfigured: false,
      clientSecretConfigured: false,
      scopes: [],
    }
  );
}

function toRoleSlugArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getInvitationStatus(
  invitation: Pick<AuthInvitation, 'revokedAt' | 'redeemedAt' | 'expiresAt'>
): AuthInvitationSummary['status'] {
  if (invitation.revokedAt) {
    return 'revoked';
  }
  if (invitation.redeemedAt) {
    return 'redeemed';
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return 'expired';
  }
  return 'pending';
}

function transformInvitation(row: Record<string, unknown>): AuthInvitation {
  return {
    id: row.id as string,
    email: row.email as string,
    roleSlugs: toRoleSlugArray(row.role_slugs),
    note: (row.note as string | null) ?? null,
    invitedBy: (row.invited_by as string | null) ?? null,
    redeemedByUserId: (row.redeemed_by_user_id as string | null) ?? null,
    expiresAt: row.expires_at as Date,
    redeemedAt: (row.redeemed_at as Date | null) ?? null,
    revokedAt: (row.revoked_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function toInvitationSummary(invitation: AuthInvitation): AuthInvitationSummary {
  return {
    ...invitation,
    status: getInvitationStatus(invitation),
  };
}

async function applyRoleAssignmentsForUser(
  trx: ReturnType<typeof getDb>,
  userId: string,
  roleSlugs: string[]
): Promise<void> {
  const normalizedRoleSlugs = Array.from(new Set(roleSlugs.filter(Boolean))).sort();
  const roleRows = await trx('auth_roles').whereIn('slug', normalizedRoleSlugs).select('id');

  for (const role of roleRows) {
    await trx('auth_user_roles')
      .insert({
        user_id: userId,
        role_id: role.id,
        created_at: trx.fn.now(),
      })
      .onConflict(['user_id', 'role_id'])
      .ignore();
  }
}

async function getSiteUserRecord(userId: string): Promise<SiteUser | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const row = await getDb()('site_users').where('id', userId).first();
  if (!row) {
    return null;
  }

  return row as SiteUser;
}

async function getRolesForUser(userId: string): Promise<string[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const rows = await getDb()('auth_user_roles as user_roles')
    .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
    .where('user_roles.user_id', userId)
    .orderBy('roles.slug', 'asc')
    .select('roles.slug');

  return rows.map((row) => row.slug as string);
}

async function getPermissionsForUser(userId: string): Promise<string[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const rows = await getDb()('auth_user_roles as user_roles')
    .join(
      'auth_role_permissions as role_permissions',
      'role_permissions.role_id',
      'user_roles.role_id'
    )
    .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
    .where('user_roles.user_id', userId)
    .distinct('permissions.slug')
    .orderBy('permissions.slug', 'asc');

  return rows.map((row) => row.slug as string);
}

function getPrimaryRole(roles: string[]): string {
  const orderedRoles = ['superadmin', 'admin', 'editor', 'member'];
  return orderedRoles.find((role) => roles.includes(role)) ?? roles[0] ?? 'member';
}

function toAuthSubject(
  user: Pick<SiteUser, 'id' | 'email' | 'display_name' | 'avatar_url'>,
  roles: string[],
  permissions: string[]
): AuthSubject {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    primaryRole: getPrimaryRole(roles),
    roles,
    permissions,
    isAdmin:
      roles.some((role) => ADMIN_ROLE_SLUGS.has(role)) || permissions.includes('admin.access'),
  };
}

export async function getAuthSettings(): Promise<AuthSettings> {
  const settings = await getSettings([
    'auth_credentials_enabled',
    'auth_registration_enabled',
    'auth_account_linking_enabled',
    'auth_install_completed',
    'auth_setup_banner_dismissed',
  ]);

  return {
    credentialsEnabled: settings.auth_credentials_enabled !== false,
    registrationEnabled: settings.auth_registration_enabled === true,
    accountLinkingEnabled: settings.auth_account_linking_enabled !== false,
    installCompleted: settings.auth_install_completed === true,
    setupBannerDismissed: settings.auth_setup_banner_dismissed === true,
  };
}

export async function updateAuthSettings(input: Partial<AuthSettings>): Promise<void> {
  const updates: Record<string, boolean> = {};

  if (typeof input.credentialsEnabled === 'boolean') {
    await upsertSetting(
      'auth_credentials_enabled',
      input.credentialsEnabled,
      'boolean',
      'auth',
      'Whether username/password credential login is enabled.'
    );
  }

  if (typeof input.registrationEnabled === 'boolean') {
    updates.auth_registration_enabled = input.registrationEnabled;
  }
  if (typeof input.accountLinkingEnabled === 'boolean') {
    updates.auth_account_linking_enabled = input.accountLinkingEnabled;
  }
  if (typeof input.installCompleted === 'boolean') {
    updates.auth_install_completed = input.installCompleted;
  }
  if (typeof input.setupBannerDismissed === 'boolean') {
    updates.auth_setup_banner_dismissed = input.setupBannerDismissed;
  }

  if (Object.keys(updates).length > 0) {
    await updateSettings(updates);
  }
}

export async function getAuthProviderSummaries(): Promise<AuthProviderSummary[]> {
  if (!(await hasAuthTables())) {
    return SYSTEM_PROVIDER_DEFINITIONS;
  }

  const rows = await getDb()('auth_provider_configs').select('*').orderBy('provider_name', 'asc');
  const summaryMap = new Map<string, AuthProviderSummary>();

  for (const defaultProvider of SYSTEM_PROVIDER_DEFINITIONS) {
    summaryMap.set(defaultProvider.provider, defaultProvider);
  }

  for (const row of rows) {
    summaryMap.set(row.provider_slug as string, {
      provider: row.provider_slug as string,
      label: row.provider_name as string,
      enabled: Boolean(row.enabled),
      clientIdConfigured: Boolean(row.client_id_encrypted),
      clientSecretConfigured: Boolean(row.client_secret_encrypted),
      scopes: toStringArray(
        row.scopes,
        getDefaultProviderSummary(row.provider_slug as string).scopes
      ),
      issuer: (row.issuer as string | null) ?? null,
    });
  }

  return Array.from(summaryMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

export async function getPublicAuthConfiguration(): Promise<{
  settings: AuthSettings;
  providers: AuthProviderSummary[];
}> {
  const [settings, providers] = await Promise.all([getAuthSettings(), getAuthProviderSummaries()]);

  return {
    settings,
    providers: providers.filter(
      (provider) =>
        provider.enabled && provider.clientIdConfigured && provider.clientSecretConfigured
    ),
  };
}

export async function getProviderCredentialSet(
  provider: string
): Promise<AuthProviderCredentialSet | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const row = await getDb()('auth_provider_configs').where('provider_slug', provider).first();
  if (!row || !row.enabled) {
    return null;
  }

  const clientId = decryptSecret(row.client_id_encrypted as string | null);
  const clientSecret = decryptSecret(row.client_secret_encrypted as string | null);

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    provider: row.provider_slug as string,
    label: row.provider_name as string,
    clientId,
    clientSecret,
    scopes: toStringArray(
      row.scopes,
      getDefaultProviderSummary(row.provider_slug as string).scopes
    ),
    issuer: (row.issuer as string | null) ?? null,
  };
}

export async function updateAuthProviderConfig(input: AuthProviderConfig): Promise<void> {
  if (!(await hasAuthTables())) {
    return;
  }

  const existing = await getDb()('auth_provider_configs')
    .where('provider_slug', input.provider)
    .first();
  const currentSummary = getDefaultProviderSummary(input.provider);

  await getDb()('auth_provider_configs')
    .insert({
      provider_slug: input.provider,
      provider_name: input.label ?? existing?.provider_name ?? currentSummary.label,
      enabled: input.enabled,
      client_id_encrypted: input.clientId
        ? encryptSecret(input.clientId)
        : existing?.client_id_encrypted ?? null,
      client_secret_encrypted: input.clientSecret
        ? encryptSecret(input.clientSecret)
        : existing?.client_secret_encrypted ?? null,
      issuer: input.issuer ?? existing?.issuer ?? null,
      scopes: JSON.stringify(input.scopes ?? existing?.scopes ?? currentSummary.scopes),
      metadata: JSON.stringify(existing?.metadata ?? {}),
      created_at: existing?.created_at ?? getDb().fn.now(),
      updated_at: getDb().fn.now(),
    })
    .onConflict('provider_slug')
    .merge({
      provider_name: input.label ?? existing?.provider_name ?? currentSummary.label,
      enabled: input.enabled,
      client_id_encrypted: input.clientId
        ? encryptSecret(input.clientId)
        : existing?.client_id_encrypted ?? null,
      client_secret_encrypted: input.clientSecret
        ? encryptSecret(input.clientSecret)
        : existing?.client_secret_encrypted ?? null,
      issuer: input.issuer ?? existing?.issuer ?? null,
      scopes: JSON.stringify(input.scopes ?? existing?.scopes ?? currentSummary.scopes),
      updated_at: getDb().fn.now(),
    });
}

export async function ensureSiteUserForAdmin(adminUser: {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}): Promise<AuthSubject> {
  if (!(await hasAuthTables())) {
    return {
      id: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.display_name,
      avatarUrl: adminUser.avatar_url,
      primaryRole: 'admin',
      roles: ['admin'],
      permissions: ['admin.access'],
      isAdmin: true,
    };
  }

  const db = getDb();
  await db.transaction(async (trx) => {
    await trx('site_users')
      .insert({
        id: adminUser.id,
        email: normalizeEmail(adminUser.email),
        display_name: adminUser.display_name,
        avatar_url: adminUser.avatar_url,
        primary_auth_provider: 'credentials',
        is_active: true,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .onConflict('id')
      .merge({
        email: normalizeEmail(adminUser.email),
        display_name: adminUser.display_name,
        avatar_url: adminUser.avatar_url,
        updated_at: trx.fn.now(),
      });

    const role = await trx('auth_roles').where('slug', 'superadmin').first('id');
    if (role?.id) {
      await trx('auth_user_roles')
        .insert({
          user_id: adminUser.id,
          role_id: role.id,
          created_at: trx.fn.now(),
        })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  });

  return getAuthSubjectForUser(adminUser.id) as Promise<AuthSubject>;
}

export async function getAuthSubjectForUser(userId: string): Promise<AuthSubject | null> {
  const user = await getSiteUserRecord(userId);
  if (!user) {
    return null;
  }

  const [roles, permissions] = await Promise.all([
    getRolesForUser(userId),
    getPermissionsForUser(userId),
  ]);

  return toAuthSubject(user, roles, permissions);
}

export async function getLinkedAccountsForUser(userId: string): Promise<LinkedAuthAccount[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const rows = await getDb()('auth_provider_accounts')
    .where('user_id', userId)
    .orderBy('provider_slug', 'asc')
    .select('*');

  return rows.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    provider: row.provider_slug as string,
    providerAccountId: row.provider_account_id as string,
    providerEmail: (row.provider_email as string | null) ?? null,
    providerUsername: (row.provider_username as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  }));
}

export async function upsertOAuthAccount(params: {
  provider: string;
  providerAccountId: string;
  email: string | null | undefined;
  displayName: string | null | undefined;
  avatarUrl: string | null | undefined;
  providerUsername?: string | null | undefined;
  accessToken?: string | null | undefined;
  refreshToken?: string | null | undefined;
  expiresAt?: number | null | undefined;
  scopes?: string[];
  profileData?: Record<string, unknown> | null;
}): Promise<AuthSubject | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  if (!params.email) {
    return null;
  }

  const db = getDb();
  const authSettings = await getAuthSettings();
  const normalizedEmail = normalizeEmail(params.email);

  const authSubject = await db.transaction(async (trx) => {
    const existingLinkedAccount = await trx('auth_provider_accounts')
      .where({
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
      })
      .first();

    let siteUser: SiteUser | undefined;

    if (existingLinkedAccount) {
      siteUser = await trx('site_users').where('id', existingLinkedAccount.user_id).first();
    }

    if (!siteUser) {
      siteUser = await trx('site_users').where('email', normalizedEmail).first();
    }

    const firstUser = !(await trx('site_users').first('id'));
    if (!siteUser && !firstUser && !authSettings.registrationEnabled) {
      return null;
    }

    if (!siteUser) {
      const insertedRows = await trx('site_users')
        .insert({
          email: normalizedEmail,
          display_name: params.displayName ?? null,
          avatar_url: params.avatarUrl ?? null,
          primary_auth_provider: params.provider,
          is_active: true,
          email_verified_at: trx.fn.now(),
          last_login_at: trx.fn.now(),
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning('*');

      siteUser = insertedRows[0] as SiteUser;

      const roleSlug = firstUser ? 'superadmin' : 'member';
      const role = await trx('auth_roles').where('slug', roleSlug).first('id');
      if (role?.id) {
        await trx('auth_user_roles')
          .insert({
            user_id: siteUser.id,
            role_id: role.id,
            created_at: trx.fn.now(),
          })
          .onConflict(['user_id', 'role_id'])
          .ignore();
      }

      if (firstUser) {
        await trx('site_settings').where('key', 'auth_install_completed').update({
          value: 'true',
          updated_at: trx.fn.now(),
        });
      }
    } else {
      await trx('site_users')
        .where('id', siteUser.id)
        .update({
          display_name: params.displayName ?? siteUser.display_name,
          avatar_url: params.avatarUrl ?? siteUser.avatar_url,
          primary_auth_provider: siteUser.primary_auth_provider ?? params.provider,
          last_login_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (
        !existingLinkedAccount &&
        !authSettings.accountLinkingEnabled &&
        siteUser.email !== normalizedEmail
      ) {
        return null;
      }
    }

    await trx('auth_provider_accounts')
      .insert({
        user_id: siteUser.id,
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
        provider_email: normalizedEmail,
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .onConflict(['provider_slug', 'provider_account_id'])
      .merge({
        user_id: siteUser.id,
        provider_email: normalizedEmail,
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        updated_at: trx.fn.now(),
      });

    await trx('auth_login_events').insert({
      user_id: siteUser.id,
      provider_slug: params.provider,
      event_type: 'sign_in',
      metadata: JSON.stringify({ providerAccountId: params.providerAccountId }),
      created_at: trx.fn.now(),
    });

    const [roles, permissions] = await Promise.all([
      trx('auth_user_roles as user_roles')
        .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
        .where('user_roles.user_id', siteUser.id)
        .select('roles.slug'),
      trx('auth_user_roles as user_roles')
        .join(
          'auth_role_permissions as role_permissions',
          'role_permissions.role_id',
          'user_roles.role_id'
        )
        .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
        .where('user_roles.user_id', siteUser.id)
        .distinct('permissions.slug'),
    ]);

    return toAuthSubject(
      {
        id: siteUser.id,
        email: siteUser.email,
        display_name: siteUser.display_name,
        avatar_url: siteUser.avatar_url,
      },
      roles.map((row) => row.slug as string),
      permissions.map((row) => row.slug as string)
    );
  });

  return authSubject;
}

export async function getAuthUserByEmail(email: string): Promise<AuthUser | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const user = await getDb()('site_users').where('email', normalizeEmail(email)).first();
  if (!user) {
    return null;
  }

  return user as AuthUser;
}

async function getInvitationByToken(token: string): Promise<AuthInvitation | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const row = await getDb()('auth_invitations')
    .where('invite_token_hash', hashInviteToken(token))
    .first();
  if (!row) {
    return null;
  }

  return transformInvitation(row);
}

export async function getPublicInvitationByToken(
  token: string
): Promise<PublicAuthInvitation | null> {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    return null;
  }

  return {
    email: invitation.email,
    roleSlugs: invitation.roleSlugs,
    expiresAt: invitation.expiresAt,
    note: invitation.note,
    isValid: getInvitationStatus(invitation) === 'pending',
    status: getInvitationStatus(invitation),
  };
}

export async function listAuthInvitations(): Promise<AuthInvitationSummary[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const rows = await getDb()('auth_invitations').select('*').orderBy('created_at', 'desc');
  return rows.map((row) => toInvitationSummary(transformInvitation(row)));
}

export async function createAuthInvitation(input: {
  email: string;
  roleSlugs: string[];
  invitedBy: string;
  note?: string | null;
  expiresInHours?: number;
}): Promise<{ invitation: AuthInvitationSummary; rawToken: string }> {
  if (!(await hasAuthTables())) {
    throw new Error('Auth tables are unavailable');
  }

  const roleSlugs = Array.from(new Set(input.roleSlugs.map((role) => role.trim()).filter(Boolean)));
  if (roleSlugs.length === 0) {
    throw new Error('At least one role is required for an invitation');
  }

  const roles = await getDb()('auth_roles').whereIn('slug', roleSlugs).select('slug');
  if (roles.length !== roleSlugs.length) {
    throw new Error('One or more invitation roles are invalid');
  }

  const rawToken = createInviteToken();
  const expiresAt = new Date(
    Date.now() + (input.expiresInHours ?? DEFAULT_INVITE_TTL_HOURS) * 60 * 60 * 1000
  );

  const [row] = await getDb()('auth_invitations')
    .insert({
      email: normalizeEmail(input.email),
      invite_token_hash: hashInviteToken(rawToken),
      role_slugs: JSON.stringify(roleSlugs),
      note: input.note ?? null,
      invited_by: input.invitedBy,
      expires_at: expiresAt,
      created_at: getDb().fn.now(),
      updated_at: getDb().fn.now(),
    })
    .returning('*');

  return {
    invitation: toInvitationSummary(transformInvitation(row)),
    rawToken,
  };
}

export async function revokeAuthInvitation(
  invitationId: string
): Promise<AuthInvitationSummary | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const [row] = await getDb()('auth_invitations')
    .where('id', invitationId)
    .whereNull('redeemed_at')
    .update({ revoked_at: getDb().fn.now(), updated_at: getDb().fn.now() })
    .returning('*');

  return row ? toInvitationSummary(transformInvitation(row)) : null;
}

export async function redeemAuthInvitationWithOAuth(params: {
  token: string;
  provider: string;
  providerAccountId: string;
  email: string | null | undefined;
  displayName?: string | null;
  avatarUrl?: string | null;
  providerUsername?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes?: string[];
  profileData?: Record<string, unknown> | null;
}): Promise<AuthSubject | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const invitation = await getInvitationByToken(params.token);
  if (!invitation || getInvitationStatus(invitation) !== 'pending') {
    return null;
  }

  if (!params.email || normalizeEmail(params.email) !== normalizeEmail(invitation.email)) {
    return null;
  }

  const db = getDb();

  const subject = await db.transaction(async (trx) => {
    const existingLinkedAccount = await trx('auth_provider_accounts')
      .where({
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
      })
      .first();

    if (existingLinkedAccount && existingLinkedAccount.user_id) {
      throw new Error('That provider account is already linked to another user');
    }

    let siteUser = await trx('site_users').where('email', normalizeEmail(invitation.email)).first();

    if (!siteUser) {
      const insertedRows = await trx('site_users')
        .insert({
          email: normalizeEmail(invitation.email),
          display_name: params.displayName ?? null,
          avatar_url: params.avatarUrl ?? null,
          primary_auth_provider: params.provider,
          is_active: true,
          email_verified_at: trx.fn.now(),
          last_login_at: trx.fn.now(),
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning('*');

      siteUser = insertedRows[0] as SiteUser;
    } else {
      await trx('site_users')
        .where('id', siteUser.id)
        .update({
          display_name: params.displayName ?? siteUser.display_name,
          avatar_url: params.avatarUrl ?? siteUser.avatar_url,
          primary_auth_provider: siteUser.primary_auth_provider ?? params.provider,
          email_verified_at: siteUser.email_verified_at ?? trx.fn.now(),
          last_login_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
    }

    await applyRoleAssignmentsForUser(trx, siteUser.id, invitation.roleSlugs);

    await trx('auth_provider_accounts')
      .insert({
        user_id: siteUser.id,
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
        provider_email: normalizeEmail(invitation.email),
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .onConflict(['provider_slug', 'provider_account_id'])
      .merge({
        user_id: siteUser.id,
        provider_email: normalizeEmail(invitation.email),
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        updated_at: trx.fn.now(),
      });

    await trx('auth_invitations').where('id', invitation.id).update({
      redeemed_at: trx.fn.now(),
      redeemed_by_user_id: siteUser.id,
      updated_at: trx.fn.now(),
    });

    await trx('auth_login_events').insert({
      user_id: siteUser.id,
      provider_slug: params.provider,
      event_type: 'invite-redeem',
      metadata: JSON.stringify({ invitationId: invitation.id }),
      created_at: trx.fn.now(),
    });

    const [roles, permissions] = await Promise.all([
      trx('auth_user_roles as user_roles')
        .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
        .where('user_roles.user_id', siteUser.id)
        .select('roles.slug'),
      trx('auth_user_roles as user_roles')
        .join(
          'auth_role_permissions as role_permissions',
          'role_permissions.role_id',
          'user_roles.role_id'
        )
        .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
        .where('user_roles.user_id', siteUser.id)
        .distinct('permissions.slug'),
    ]);

    return toAuthSubject(
      {
        id: siteUser.id,
        email: siteUser.email,
        display_name: (siteUser.display_name as string | null) ?? params.displayName ?? null,
        avatar_url: (siteUser.avatar_url as string | null) ?? params.avatarUrl ?? null,
      },
      roles.map((row) => row.slug as string),
      permissions.map((row) => row.slug as string)
    );
  });

  return subject;
}

function toLinkedAccountSummary(row: Record<string, unknown>): LinkedAuthAccountSummary {
  return {
    id: row.id as string,
    provider: row.provider_slug as string,
    providerEmail: (row.provider_email as string | null) ?? null,
    providerUsername: (row.provider_username as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

export async function listAuthRoles(): Promise<AuthRoleWithPermissions[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const [roles, permissionRows, memberRows] = await Promise.all([
    getDb()('auth_roles').select('*').orderBy('slug', 'asc'),
    getDb()('auth_role_permissions as role_permissions')
      .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
      .select('role_permissions.role_id', 'permissions.slug'),
    getDb()('auth_user_roles')
      .select('role_id')
      .count<{ role_id: string; count: string }[]>('* as count')
      .groupBy('role_id'),
  ]);

  const permissionsByRole = new Map<string, string[]>();
  for (const row of permissionRows) {
    const roleId = row.role_id as string;
    permissionsByRole.set(roleId, [...(permissionsByRole.get(roleId) ?? []), row.slug as string]);
  }

  const membersByRole = new Map(
    memberRows.map((row) => [row.role_id as string, Number(row.count)])
  );

  return roles.map((role) => ({
    id: role.id as string,
    slug: role.slug as string,
    name: role.name as string,
    description: (role.description as string | null) ?? null,
    isSystem: Boolean(role.is_system),
    permissions: (permissionsByRole.get(role.id as string) ?? []).sort(),
    memberCount: membersByRole.get(role.id as string) ?? 0,
  }));
}

export async function listAuthUsers(): Promise<AuthManagementUser[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const [users, roleRows, permissionRows, linkedAccountRows] = await Promise.all([
    getDb()('site_users').select('*').orderBy('created_at', 'asc'),
    getDb()('auth_user_roles as user_roles')
      .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
      .select('user_roles.user_id', 'roles.slug'),
    getDb()('auth_user_roles as user_roles')
      .join(
        'auth_role_permissions as role_permissions',
        'role_permissions.role_id',
        'user_roles.role_id'
      )
      .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
      .distinct('user_roles.user_id', 'permissions.slug'),
    getDb()('auth_provider_accounts').select('*').orderBy('created_at', 'asc'),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const userId = row.user_id as string;
    rolesByUser.set(userId, [...(rolesByUser.get(userId) ?? []), row.slug as string]);
  }

  const permissionsByUser = new Map<string, string[]>();
  for (const row of permissionRows) {
    const userId = row.user_id as string;
    permissionsByUser.set(userId, [...(permissionsByUser.get(userId) ?? []), row.slug as string]);
  }

  const linkedAccountsByUser = new Map<string, LinkedAuthAccountSummary[]>();
  for (const row of linkedAccountRows) {
    const userId = row.user_id as string;
    linkedAccountsByUser.set(userId, [
      ...(linkedAccountsByUser.get(userId) ?? []),
      toLinkedAccountSummary(row),
    ]);
  }

  return users.map((user) => {
    const userId = user.id as string;
    const roles = (rolesByUser.get(userId) ?? []).sort();
    const permissions = (permissionsByUser.get(userId) ?? []).sort();
    return {
      id: userId,
      email: user.email as string,
      displayName: (user.display_name as string | null) ?? null,
      avatarUrl: (user.avatar_url as string | null) ?? null,
      primaryRole: getPrimaryRole(roles),
      roles,
      permissions,
      isActive: Boolean(user.is_active),
      isAdmin:
        roles.some((role) => ADMIN_ROLE_SLUGS.has(role)) || permissions.includes('admin.access'),
      primaryAuthProvider: (user.primary_auth_provider as string | null) ?? null,
      lastLoginAt: (user.last_login_at as Date | null) ?? null,
      createdAt: user.created_at as Date,
      updatedAt: user.updated_at as Date,
      linkedAccounts: linkedAccountsByUser.get(userId) ?? [],
    };
  });
}

async function countActiveAdminUsers(trx = getDb()) {
  const result = await trx('site_users as users')
    .join('auth_user_roles as user_roles', 'user_roles.user_id', 'users.id')
    .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
    .whereIn('roles.slug', ['superadmin', 'admin'])
    .andWhere('users.is_active', true)
    .countDistinct<{ count: string }[]>('users.id as count')
    .first();

  return Number(result?.count ?? 0);
}

async function countSuperadmins(trx = getDb()) {
  const result = await trx('auth_user_roles as user_roles')
    .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
    .where('roles.slug', 'superadmin')
    .countDistinct<{ count: string }[]>('user_roles.user_id as count')
    .first();

  return Number(result?.count ?? 0);
}

export async function updateAuthUserAccess(input: {
  userId: string;
  actingUserId?: string;
  roleSlugs?: string[];
  isActive?: boolean;
}): Promise<AuthManagementUser | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const db = getDb();

  await db.transaction(async (trx) => {
    const currentUser = await trx('site_users').where('id', input.userId).first();
    if (!currentUser) {
      throw new Error('User not found');
    }

    const currentRoleRows = await trx('auth_user_roles as user_roles')
      .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
      .where('user_roles.user_id', input.userId)
      .select('roles.slug');
    const currentRoles = currentRoleRows.map((row) => row.slug as string);

    if (input.roleSlugs) {
      const nextRoles = Array.from(new Set(input.roleSlugs));
      if (currentRoles.includes('superadmin') && !nextRoles.includes('superadmin')) {
        const superadminCount = await countSuperadmins(trx);
        if (superadminCount <= 1) {
          throw new Error('At least one superadmin must remain assigned');
        }
      }

      const roleRows = await trx('auth_roles').whereIn('slug', nextRoles).select('id', 'slug');
      if (roleRows.length !== nextRoles.length) {
        throw new Error('One or more roles are invalid');
      }

      await trx('auth_user_roles').where('user_id', input.userId).del();
      if (roleRows.length > 0) {
        await trx('auth_user_roles').insert(
          roleRows.map((role) => ({
            user_id: input.userId,
            role_id: role.id,
            created_at: trx.fn.now(),
          }))
        );
      }
    }

    if (typeof input.isActive === 'boolean') {
      if (!input.isActive) {
        const totalUserResult = await trx('site_users')
          .count<{ count: string }[]>('id as count')
          .first();
        const totalUsers = Number(totalUserResult?.count ?? 0);
        if (totalUsers <= 1) {
          throw new Error('Cannot deactivate the only user account');
        }

        if (input.actingUserId && input.actingUserId === input.userId) {
          throw new Error('You cannot deactivate your own account');
        }
      }

      const nextRoles = input.roleSlugs ?? currentRoles;
      if (!input.isActive && nextRoles.includes('superadmin')) {
        throw new Error('Superadmin accounts cannot be deactivated');
      }

      const keepsAdminAccess = nextRoles.some((role) => ADMIN_ROLE_SLUGS.has(role));
      if (!input.isActive && keepsAdminAccess) {
        const activeAdminCount = await countActiveAdminUsers(trx);
        if (activeAdminCount <= 1) {
          throw new Error('At least one active admin account must remain');
        }
      }

      await trx('site_users')
        .where('id', input.userId)
        .update({ is_active: input.isActive, updated_at: trx.fn.now() });
    }
  });

  const users = await listAuthUsers();
  return users.find((user) => user.id === input.userId) ?? null;
}

export async function linkOAuthAccountToUser(params: {
  userId: string;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  providerUsername?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes?: string[];
  profileData?: Record<string, unknown> | null;
}): Promise<AuthSubject | null> {
  if (!(await hasAuthTables())) {
    return null;
  }

  const authSettings = await getAuthSettings();
  if (!authSettings.accountLinkingEnabled) {
    return null;
  }

  const db = getDb();

  const authSubject = await db.transaction(async (trx) => {
    const siteUser = await trx('site_users').where('id', params.userId).first();
    if (!siteUser) {
      return null;
    }

    const existingLinkedAccount = await trx('auth_provider_accounts')
      .where({
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
      })
      .first();

    if (existingLinkedAccount && existingLinkedAccount.user_id !== params.userId) {
      throw new Error('That provider account is already linked to another user');
    }

    await trx('site_users')
      .where('id', params.userId)
      .update({
        display_name: siteUser.display_name ?? params.displayName ?? null,
        avatar_url: siteUser.avatar_url ?? params.avatarUrl ?? null,
        primary_auth_provider: siteUser.primary_auth_provider ?? params.provider,
        last_login_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    await trx('auth_provider_accounts')
      .insert({
        user_id: params.userId,
        provider_slug: params.provider,
        provider_account_id: params.providerAccountId,
        provider_email: params.email ? normalizeEmail(params.email) : null,
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .onConflict(['provider_slug', 'provider_account_id'])
      .merge({
        user_id: params.userId,
        provider_email: params.email ? normalizeEmail(params.email) : null,
        provider_username: params.providerUsername ?? null,
        access_token_encrypted: params.accessToken ? encryptSecret(params.accessToken) : null,
        refresh_token_encrypted: params.refreshToken ? encryptSecret(params.refreshToken) : null,
        token_expires_at: params.expiresAt ? new Date(params.expiresAt * 1000) : null,
        scopes: JSON.stringify(params.scopes ?? []),
        profile_data: JSON.stringify(params.profileData ?? {}),
        updated_at: trx.fn.now(),
      });

    await trx('auth_login_events').insert({
      user_id: params.userId,
      provider_slug: params.provider,
      event_type: 'link',
      metadata: JSON.stringify({ providerAccountId: params.providerAccountId }),
      created_at: trx.fn.now(),
    });

    const [roles, permissions] = await Promise.all([
      trx('auth_user_roles as user_roles')
        .join('auth_roles as roles', 'roles.id', 'user_roles.role_id')
        .where('user_roles.user_id', params.userId)
        .select('roles.slug'),
      trx('auth_user_roles as user_roles')
        .join(
          'auth_role_permissions as role_permissions',
          'role_permissions.role_id',
          'user_roles.role_id'
        )
        .join('auth_permissions as permissions', 'permissions.id', 'role_permissions.permission_id')
        .where('user_roles.user_id', params.userId)
        .distinct('permissions.slug'),
    ]);

    return toAuthSubject(
      {
        id: siteUser.id,
        email: siteUser.email,
        display_name: (siteUser.display_name as string | null) ?? params.displayName ?? null,
        avatar_url: (siteUser.avatar_url as string | null) ?? params.avatarUrl ?? null,
      },
      roles.map((row) => row.slug as string),
      permissions.map((row) => row.slug as string)
    );
  });

  return authSubject;
}

export async function unlinkOAuthAccountForUser(
  userId: string,
  linkedAccountId: string
): Promise<LinkedAuthAccount[]> {
  if (!(await hasAuthTables())) {
    return [];
  }

  const db = getDb();

  await db.transaction(async (trx) => {
    const accounts = await trx('auth_provider_accounts')
      .where('user_id', userId)
      .orderBy('created_at', 'asc');

    const accountToRemove = accounts.find((account) => account.id === linkedAccountId);
    if (!accountToRemove) {
      throw new Error('Linked account not found');
    }

    if (accounts.length <= 1) {
      throw new Error('At least one linked account must remain attached');
    }

    await trx('auth_provider_accounts').where({ id: linkedAccountId, user_id: userId }).del();

    const remainingAccounts = accounts.filter((account) => account.id !== linkedAccountId);
    const currentUser = await trx('site_users').where('id', userId).first();
    if (currentUser?.primary_auth_provider === accountToRemove.provider_slug) {
      await trx('site_users')
        .where('id', userId)
        .update({
          primary_auth_provider: remainingAccounts[0]?.provider_slug ?? null,
          updated_at: trx.fn.now(),
        });
    }

    await trx('auth_login_events').insert({
      user_id: userId,
      provider_slug: accountToRemove.provider_slug,
      event_type: 'unlink',
      metadata: JSON.stringify({ linkedAccountId }),
      created_at: trx.fn.now(),
    });
  });

  return getLinkedAccountsForUser(userId);
}

export async function getAuthOnboardingStatus(userId: string): Promise<AuthOnboardingStatus> {
  const [settings, providers, invitations, linkedAccounts] = await Promise.all([
    getSettings(['auth_admin_checklist_dismissed']),
    getAuthProviderSummaries(),
    listAuthInvitations(),
    getLinkedAccountsForUser(userId),
  ]);

  const providersReady = providers.filter(
    (provider) => provider.enabled && provider.clientIdConfigured && provider.clientSecretConfigured
  ).length;
  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === 'pending'
  ).length;
  const linkedAccountCount = linkedAccounts.length;

  return {
    dismissed: settings.auth_admin_checklist_dismissed === true,
    recoveryOverrideEnabled: authConfig.setupBypassEnabled,
    providersReady,
    pendingInvitations,
    linkedAccountCount,
    items: [
      {
        key: 'providers',
        title: 'Turn on at least one OAuth provider',
        description:
          'Provider credentials can stay private while sign-in stays closed until you are ready.',
        href: '/admin/settings',
        completed: providersReady > 0,
      },
      {
        key: 'invites',
        title: 'Create an invite-only onboarding link',
        description: 'Onboard collaborators without opening site-wide registration.',
        href: '/admin/users',
        completed: invitations.length > 0,
      },
      {
        key: 'backup-provider',
        title: 'Link a backup provider to your own account',
        description: 'Keep more than one login path attached to the superadmin account.',
        href: '/admin/profile',
        completed: linkedAccountCount > 1,
      },
    ],
  };
}

export async function dismissAuthOnboardingStatus(): Promise<void> {
  await updateSettings({ auth_admin_checklist_dismissed: true });
}
