import NextAuth from 'next-auth';
import { cookies } from 'next/headers';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { auth as authConfig } from '@/config/env';
import {
  getAuthSettings,
  getAuthSubjectForUser,
  linkOAuthAccountToUser,
  getProviderCredentialSet,
  redeemAuthInvitationWithOAuth,
  upsertOAuthAccount,
} from '@/db/auth';

const LINK_ACCOUNT_COOKIE = 'devholm-link-account';
const INVITE_ACCOUNT_COOKIE = 'devholm-auth-invite';

function parseLinkCookie(value: string | undefined): { userId: string; provider: string } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as { userId?: string; provider?: string };
    if (!parsed.userId || !parsed.provider) {
      return null;
    }

    return { userId: parsed.userId, provider: parsed.provider };
  } catch {
    return null;
  }
}

function parseInviteCookie(value: string | undefined): { token: string; provider: string } | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as { token?: string; provider?: string };
    if (!parsed.token || !parsed.provider) {
      return null;
    }

    return { token: parsed.token, provider: parsed.provider };
  } catch {
    return null;
  }
}

// User interface for authentication
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
  installCompleted: boolean;
  image?: string | null;
}

async function buildOAuthProviders() {
  let googleConfig = null;
  let githubConfig = null;
  let discordConfig = null;

  try {
    [googleConfig, githubConfig, discordConfig] = await Promise.all([
      getProviderCredentialSet('google').catch(() => null),
      getProviderCredentialSet('github').catch(() => null),
      getProviderCredentialSet('discord').catch(() => null),
    ]);
  } catch {
    // DB unavailable or tables not yet created — continue with no OAuth providers
  }

  const providers = [];

  if (googleConfig) {
    providers.push(
      Google({
        clientId: googleConfig.clientId,
        clientSecret: googleConfig.clientSecret,
        authorization: { params: { scope: googleConfig.scopes.join(' ') } },
      })
    );
  }

  if (githubConfig) {
    providers.push(
      GitHub({
        clientId: githubConfig.clientId,
        clientSecret: githubConfig.clientSecret,
        authorization: { params: { scope: githubConfig.scopes.join(' ') } },
      })
    );
  }

  if (discordConfig) {
    providers.push(
      Discord({
        clientId: discordConfig.clientId,
        clientSecret: discordConfig.clientSecret,
        authorization: { params: { scope: discordConfig.scopes.join(' ') } },
      })
    );
  }

  return providers;
}

export const { handlers, signIn, signOut, auth } = NextAuth(async () => ({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          const baseUrl = authConfig.url;
          const response = await fetch(`${baseUrl}/api/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            return null;
          }

          const user = await response.json();
          return user as User;
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
    ...(await buildOAuthProviders()),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') {
        return true;
      }

      if (!user.email) {
        return `/admin/login?error=oauth-email-required&provider=${encodeURIComponent(account.provider)}`;
      }

      const cookieStore = await cookies();
      const linkState = parseLinkCookie(cookieStore.get(LINK_ACCOUNT_COOKIE)?.value);
      const inviteState = parseInviteCookie(cookieStore.get(INVITE_ACCOUNT_COOKIE)?.value);
      const authSettings = await getAuthSettings();

      const providerSubject =
        inviteState && inviteState.provider === account.provider
          ? await redeemAuthInvitationWithOAuth({
              token: inviteState.token,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              email: user.email,
              displayName: user.name,
              avatarUrl: user.image,
              providerUsername:
                typeof profile?.login === 'string'
                  ? profile.login
                  : typeof profile?.username === 'string'
                    ? profile.username
                    : null,
              accessToken: typeof account.access_token === 'string' ? account.access_token : null,
              refreshToken:
                typeof account.refresh_token === 'string' ? account.refresh_token : null,
              expiresAt: typeof account.expires_at === 'number' ? account.expires_at : null,
              scopes: account.scope ? account.scope.split(/[\s,]+/).filter(Boolean) : undefined,
              profileData: profile as Record<string, unknown> | null,
            })
          : linkState && linkState.provider === account.provider
            ? await linkOAuthAccountToUser({
                userId: linkState.userId,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                email: user.email,
                displayName: user.name,
                avatarUrl: user.image,
                providerUsername:
                  typeof profile?.login === 'string'
                    ? profile.login
                    : typeof profile?.username === 'string'
                      ? profile.username
                      : null,
                accessToken: typeof account.access_token === 'string' ? account.access_token : null,
                refreshToken:
                  typeof account.refresh_token === 'string' ? account.refresh_token : null,
                expiresAt: typeof account.expires_at === 'number' ? account.expires_at : null,
                scopes: account.scope ? account.scope.split(/[\s,]+/).filter(Boolean) : undefined,
                profileData: profile as Record<string, unknown> | null,
              })
            : await upsertOAuthAccount({
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                email: user.email,
                displayName: user.name,
                avatarUrl: user.image,
                providerUsername:
                  typeof profile?.login === 'string'
                    ? profile.login
                    : typeof profile?.username === 'string'
                      ? profile.username
                      : null,
                accessToken: typeof account.access_token === 'string' ? account.access_token : null,
                refreshToken:
                  typeof account.refresh_token === 'string' ? account.refresh_token : null,
                expiresAt: typeof account.expires_at === 'number' ? account.expires_at : null,
                scopes: account.scope ? account.scope.split(/[\s,]+/).filter(Boolean) : undefined,
                profileData: profile as Record<string, unknown> | null,
              });

      if (inviteState) {
        cookieStore.delete(INVITE_ACCOUNT_COOKIE);
      }

      if (linkState) {
        cookieStore.delete(LINK_ACCOUNT_COOKIE);
      }

      if (!providerSubject) {
        return false;
      }

      user.id = providerSubject.id;
      user.email = providerSubject.email;
      user.name = providerSubject.displayName ?? user.name;
      user.image = providerSubject.avatarUrl ?? user.image;
      (user as User).role = providerSubject.primaryRole;
      (user as User).roles = providerSubject.roles;
      (user as User).permissions = providerSubject.permissions;
      (user as User).isAdmin = providerSubject.isAdmin;
      (user as User).installCompleted = authSettings.installCompleted;

      return true;
    },
    async jwt({ token, user }) {
      try {
        if (user) {
          token.id = user.id ?? '';
          token.role = (user as User).role;
          token.roles = (user as User).roles ?? [];
          token.permissions = (user as User).permissions ?? [];
          token.isAdmin = (user as User).isAdmin ?? false;
          token.installCompleted = (user as User).installCompleted ?? true;
        } else if (token.id) {
          const [subject, authSettings] = await Promise.all([
            getAuthSubjectForUser(token.id as string).catch(() => null),
            getAuthSettings().catch(() => ({
              registrationEnabled: false,
              accountLinkingEnabled: true,
              installCompleted: true,
              setupBannerDismissed: false,
            })),
          ]);
          if (subject) {
            token.role = subject.primaryRole;
            token.roles = subject.roles;
            token.permissions = subject.permissions;
            token.isAdmin = subject.isAdmin;
          }
          token.installCompleted = authSettings.installCompleted;
        } else {
          const authSettings = await getAuthSettings().catch(() => ({
            registrationEnabled: false,
            accountLinkingEnabled: true,
            installCompleted: true,
            setupBannerDismissed: false,
          }));
          token.installCompleted = authSettings.installCompleted;
        }
      } catch {
        // DB unavailable — preserve existing token fields, assume install completed
        if (token.installCompleted === undefined) {
          token.installCompleted = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? 'member';
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.isAdmin = Boolean(token.isAdmin);
        session.user.installCompleted = Boolean(token.installCompleted);
      }
      return session;
    },
  },
  pages: {
    signIn: '/admin/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: authConfig.sessionDuration,
  },
  trustHost: true,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}));

// Type augmentation for NextAuth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: string;
      roles: string[];
      permissions: string[];
      isAdmin: boolean;
      installCompleted: boolean;
    };
  }

  interface User {
    role: string;
    roles: string[];
    permissions: string[];
    isAdmin: boolean;
    installCompleted: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    roles: string[];
    permissions: string[];
    isAdmin: boolean;
    installCompleted: boolean;
  }
}
