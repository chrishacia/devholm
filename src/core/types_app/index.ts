// =============================================================================
// Database Types
// =============================================================================

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: Date;
}

export interface Series {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export type PostStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content_markdown: string;
  content_html: string | null;
  status: PostStatus;
  published_at: Date | null;
  scheduled_at: Date | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  reading_time_minutes: number;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  og_image_url: string | null;
  noindex: boolean;
  author_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostWithRelations extends Post {
  tags?: Tag[];
  series?: Series[];
  author?: Pick<AdminUser, 'id' | 'display_name' | 'avatar_url'>;
}

export type InboxMessageStatus = 'unread' | 'read' | 'archived' | 'deleted' | 'spam';

export interface InboxMessage {
  id: string;
  source: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  body: string;
  status: InboxMessageStatus;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  read_at: Date | null;
}

export interface MediaAsset {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  public_url: string | null;
  alt_text: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  uploaded_by: string | null;
  created_at: Date;
}

// =============================================================================
// API Types
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// Auth Types
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SiteUser extends AuthUser {
  primary_auth_provider: string | null;
  is_active: boolean;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuthRole {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuthPermission {
  id: string;
  slug: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LinkedAuthAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  providerEmail: string | null;
  providerUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkedAuthAccountSummary {
  id: string;
  provider: string;
  providerEmail: string | null;
  providerUsername: string | null;
  createdAt: Date;
}

export interface AuthSubject {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryRole: string;
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
}

export interface AuthSettings {
  registrationEnabled: boolean;
  accountLinkingEnabled: boolean;
  installCompleted: boolean;
  setupBannerDismissed?: boolean;
}

export interface AuthProviderSummary {
  provider: string;
  label: string;
  enabled: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  scopes: string[];
  issuer?: string | null;
}

export interface AuthProviderConfig {
  provider: string;
  label?: string;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  issuer?: string | null;
}

export interface AuthProviderCredentialSet {
  provider: string;
  label: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  issuer?: string | null;
}

export interface AuthManagementUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryRole: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  isAdmin: boolean;
  primaryAuthProvider: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  linkedAccounts: LinkedAuthAccountSummary[];
}

export interface AuthRoleWithPermissions {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface AuthInvitation {
  id: string;
  email: string;
  roleSlugs: string[];
  note: string | null;
  invitedBy: string | null;
  redeemedByUserId: string | null;
  expiresAt: Date;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthInvitationSummary extends AuthInvitation {
  status: 'pending' | 'redeemed' | 'revoked' | 'expired';
}

export interface PublicAuthInvitation {
  email: string;
  roleSlugs: string[];
  expiresAt: Date;
  note?: string | null;
  isValid?: boolean;
  status: 'pending' | 'redeemed' | 'revoked' | 'expired';
}

export interface AuthOnboardingChecklistItem {
  key: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

export interface AuthOnboardingStatus {
  dismissed: boolean;
  recoveryOverrideEnabled: boolean;
  providersReady: number;
  pendingInvitations: number;
  linkedAccountCount: number;
  items: AuthOnboardingChecklistItem[];
}

export interface LoginCredentials {
  email: string;
  password: string;
  totp_code?: string;
}

// =============================================================================
// Contact Form Types
// =============================================================================

export interface ContactFormData {
  name: string;
  email: string;
  subject?: string;
  message: string;
  honeypot?: string;
  timestamp?: number;
}

// =============================================================================
// Site Config Types
// =============================================================================

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  author: {
    name: string;
    email: string;
    url?: string;
  };
  social: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    discord?: string;
  };
}

// =============================================================================
// Navigation Types
// =============================================================================

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType;
  external?: boolean;
  adminOnly?: boolean;
  children?: NavItem[];
}

// =============================================================================
// Search Types
// =============================================================================

export interface SearchResult {
  type: 'post' | 'page';
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  url: string;
  highlight?: string;
}
