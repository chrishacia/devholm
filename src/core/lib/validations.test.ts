import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  postSchema,
  tagSchema,
  seriesSchema,
  contactFormSchema,
  inboxUpdateSchema,
  mediaUpdateSchema,
  searchSchema,
  paginationSchema,
  siteSettingsUpdateSchema,
  profileUpdateSchema,
  emailChangeSchema,
  passwordChangeSchema,
} from './validations';

describe('validations', () => {
  describe('loginSchema', () => {
    it('validates a valid login input', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('validates with optional TOTP code', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        totpCode: '123456',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'invalid-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('8 characters');
      }
    });
  });

  describe('postSchema', () => {
    const validPost = {
      title: 'Test Post',
      slug: 'test-post',
      contentMarkdown: 'Some content here',
    };

    it('validates a minimal valid post', () => {
      const result = postSchema.safeParse(validPost);
      expect(result.success).toBe(true);
    });

    it('validates a full post', () => {
      const result = postSchema.safeParse({
        ...validPost,
        excerpt: 'A short excerpt',
        status: 'published',
        publishedAt: new Date(),
        featuredImageUrl: 'https://example.com/image.jpg',
        seoTitle: 'SEO Title',
        seoDescription: 'SEO Description',
        tags: ['tag1', 'tag2'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = postSchema.safeParse({
        ...validPost,
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid slug format', () => {
      const result = postSchema.safeParse({
        ...validPost,
        slug: 'Invalid Slug',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('lowercase');
      }
    });

    it('allows empty string for optional URL fields', () => {
      const result = postSchema.safeParse({
        ...validPost,
        featuredImageUrl: '',
        canonicalUrl: '',
        ogImageUrl: '',
      });
      expect(result.success).toBe(true);
    });

    it('defaults status to draft', () => {
      const result = postSchema.safeParse(validPost);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('draft');
      }
    });
  });

  describe('tagSchema', () => {
    it('validates a valid tag', () => {
      const result = tagSchema.safeParse({
        name: 'JavaScript',
        slug: 'javascript',
      });
      expect(result.success).toBe(true);
    });

    it('validates with optional description', () => {
      const result = tagSchema.safeParse({
        name: 'JavaScript',
        slug: 'javascript',
        description: 'Posts about JavaScript',
      });
      expect(result.success).toBe(true);
    });

    it('rejects name that is too long', () => {
      const result = tagSchema.safeParse({
        name: 'a'.repeat(101),
        slug: 'valid-slug',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('seriesSchema', () => {
    it('validates a valid series', () => {
      const result = seriesSchema.safeParse({
        name: 'Web Development Basics',
        slug: 'web-development-basics',
      });
      expect(result.success).toBe(true);
    });

    it('defaults sortOrder to 0', () => {
      const result = seriesSchema.safeParse({
        name: 'Series Name',
        slug: 'series-name',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
      }
    });
  });

  describe('contactFormSchema', () => {
    const validContact = {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'This is a test message that is long enough.',
    };

    it('validates a valid contact form submission', () => {
      const result = contactFormSchema.safeParse(validContact);
      expect(result.success).toBe(true);
    });

    it('validates with optional subject', () => {
      const result = contactFormSchema.safeParse({
        ...validContact,
        subject: 'Hello!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects message that is too short', () => {
      const result = contactFormSchema.safeParse({
        ...validContact,
        message: 'Hi',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('10 characters');
      }
    });

    it('rejects filled honeypot field', () => {
      const result = contactFormSchema.safeParse({
        ...validContact,
        website: 'spam-link.com',
      });
      expect(result.success).toBe(false);
    });

    it('allows empty honeypot field', () => {
      const result = contactFormSchema.safeParse({
        ...validContact,
        website: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('inboxUpdateSchema', () => {
    it('validates a valid inbox update', () => {
      const result = inboxUpdateSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'read',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = inboxUpdateSchema.safeParse({
        id: 'not-a-uuid',
        status: 'read',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = inboxUpdateSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('mediaUpdateSchema', () => {
    it('validates a valid media update', () => {
      const result = mediaUpdateSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        altText: 'An image description',
        caption: 'Image caption',
      });
      expect(result.success).toBe(true);
    });

    it('rejects alt text that is too long', () => {
      const result = mediaUpdateSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        altText: 'a'.repeat(301),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('searchSchema', () => {
    it('validates a valid search input', () => {
      const result = searchSchema.safeParse({
        query: 'javascript',
      });
      expect(result.success).toBe(true);
    });

    it('defaults type to all', () => {
      const result = searchSchema.safeParse({
        query: 'test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('all');
      }
    });

    it('rejects query that is too short', () => {
      const result = searchSchema.safeParse({
        query: 'a',
      });
      expect(result.success).toBe(false);
    });

    it('rejects query that is too long', () => {
      const result = searchSchema.safeParse({
        query: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('validates a valid pagination input', () => {
      const result = paginationSchema.safeParse({
        page: 1,
        pageSize: 10,
      });
      expect(result.success).toBe(true);
    });

    it('provides defaults', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(10);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('coerces string numbers', () => {
      const result = paginationSchema.safeParse({
        page: '2',
        pageSize: '20',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.pageSize).toBe(20);
      }
    });

    it('rejects pageSize over 100', () => {
      const result = paginationSchema.safeParse({
        pageSize: 150,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('siteSettingsUpdateSchema', () => {
    it('validates a valid settings map', () => {
      const result = siteSettingsUpdateSchema.safeParse({
        'site.name': 'My Site',
        'site.description': 'A great site',
        'analytics.enabled': true,
        'posts.perPage': 10,
      });
      expect(result.success).toBe(true);
    });

    it('accepts null values', () => {
      const result = siteSettingsUpdateSchema.safeParse({
        'site.logoUrl': null,
        'site.faviconUrl': null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = siteSettingsUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects invalid value types', () => {
      const result = siteSettingsUpdateSchema.safeParse({
        'site.name': { nested: 'object' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('profileUpdateSchema', () => {
    it('validates a valid profile update', () => {
      const result = profileUpdateSchema.safeParse({
        displayName: 'John Doe',
        bio: 'A software developer',
        title: 'Senior Engineer',
        location: 'San Francisco, CA',
        websiteUrl: 'https://example.com',
        twitterHandle: '@johndoe',
        githubHandle: 'johndoe',
        linkedinHandle: 'johndoe',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty/partial updates', () => {
      const result = profileUpdateSchema.safeParse({
        displayName: 'Jane',
      });
      expect(result.success).toBe(true);
    });

    it('accepts null values for optional fields', () => {
      const result = profileUpdateSchema.safeParse({
        bio: null,
        title: null,
        location: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty string for websiteUrl', () => {
      const result = profileUpdateSchema.safeParse({
        websiteUrl: '',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid websiteUrl', () => {
      const result = profileUpdateSchema.safeParse({
        websiteUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('rejects too long bio', () => {
      const result = profileUpdateSchema.safeParse({
        bio: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('too long');
      }
    });

    it('validates avatarMediaId as UUID', () => {
      const result = profileUpdateSchema.safeParse({
        avatarMediaId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid avatarMediaId', () => {
      const result = profileUpdateSchema.safeParse({
        avatarMediaId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('emailChangeSchema', () => {
    it('validates a valid email change', () => {
      const result = emailChangeSchema.safeParse({
        email: 'newemail@example.com',
        currentPassword: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = emailChangeSchema.safeParse({
        email: 'invalid-email',
        currentPassword: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = emailChangeSchema.safeParse({
        email: 'test@example.com',
        currentPassword: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('passwordChangeSchema', () => {
    it('validates a valid password change', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mismatched passwords', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
        confirmPassword: 'differentpassword',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("don't match");
      }
    });

    it('rejects short new password', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldpassword123',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      expect(result.success).toBe(false);
    });
  });
});
