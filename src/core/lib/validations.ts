import { z } from 'zod';

// =============================================================================
// Auth Schemas
// =============================================================================

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  totpCode: z.string().length(6).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// =============================================================================
// Post Schemas
// =============================================================================

export const postSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300, 'Title too long'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(300, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  excerpt: z.string().max(500, 'Excerpt too long').optional(),
  contentMarkdown: z.string().min(1, 'Content is required'),
  status: z.enum(['draft', 'published', 'scheduled', 'archived']).default('draft'),
  publishedAt: z.coerce.date().optional(),
  scheduledAt: z.coerce.date().optional(),
  featuredImageUrl: z.string().url().optional().or(z.literal('')),
  featuredImageAlt: z.string().max(300).optional(),
  seoTitle: z.string().max(70, 'SEO title should be under 70 characters').optional(),
  seoDescription: z.string().max(160, 'SEO description should be under 160 characters').optional(),
  canonicalUrl: z.string().url().optional().or(z.literal('')),
  ogImageUrl: z.string().url().optional().or(z.literal('')),
  noindex: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
  series: z.array(z.string()).optional(),
});

export type PostInput = z.infer<typeof postSchema>;

export const postUpdateSchema = postSchema.partial().extend({
  id: z.string().uuid(),
});

export type PostUpdateInput = z.infer<typeof postUpdateSchema>;

// =============================================================================
// Tag Schemas
// =============================================================================

export const tagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  description: z.string().max(500, 'Description too long').optional(),
});

export type TagInput = z.infer<typeof tagSchema>;

// =============================================================================
// Series Schemas
// =============================================================================

export const seriesSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  description: z.string().max(1000, 'Description too long').optional(),
  sortOrder: z.number().int().default(0),
});

export type SeriesInput = z.infer<typeof seriesSchema>;

// =============================================================================
// Contact Form Schemas
// =============================================================================

export const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  subject: z.string().max(500, 'Subject too long').optional(),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message too long'),
  // Honeypot field - should be empty
  website: z.string().max(0, 'Invalid submission').optional(),
  // Timestamp for bot detection
  timestamp: z.number().optional(),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

// =============================================================================
// Inbox Schemas
// =============================================================================

export const inboxUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['unread', 'read', 'archived', 'deleted', 'spam']),
});

export type InboxUpdateInput = z.infer<typeof inboxUpdateSchema>;

// =============================================================================
// Media Schemas
// =============================================================================

export const mediaUpdateSchema = z.object({
  id: z.string().uuid(),
  altText: z.string().max(300, 'Alt text too long').optional(),
  caption: z.string().max(1000, 'Caption too long').optional(),
});

export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>;

// =============================================================================
// Search Schemas
// =============================================================================

export const searchSchema = z.object({
  query: z.string().min(2, 'Search query too short').max(100, 'Search query too long'),
  type: z.enum(['all', 'posts', 'pages']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});

export type SearchInput = z.infer<typeof searchSchema>;

// =============================================================================
// Pagination Schemas
// =============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// =============================================================================
// Settings Schemas
// =============================================================================

export const siteSettingsUpdateSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export type SiteSettingsUpdateInput = z.infer<typeof siteSettingsUpdateSchema>;

// =============================================================================
// Profile Schemas
// =============================================================================

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(100, 'Display name too long')
    .optional(),
  bio: z.string().max(500, 'Bio too long').optional().nullable(),
  title: z.string().max(100, 'Title too long').optional().nullable(),
  location: z.string().max(100, 'Location too long').optional().nullable(),
  websiteUrl: z.string().url('Invalid URL').optional().nullable().or(z.literal('')),
  twitterHandle: z.string().max(50, 'Twitter handle too long').optional().nullable(),
  githubHandle: z.string().max(50, 'GitHub handle too long').optional().nullable(),
  linkedinHandle: z.string().max(100, 'LinkedIn handle too long').optional().nullable(),
  avatarMediaId: z.string().uuid('Invalid media ID').optional().nullable(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const emailChangeSchema = z.object({
  email: z.string().email('Invalid email address'),
  currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type EmailChangeInput = z.infer<typeof emailChangeSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
