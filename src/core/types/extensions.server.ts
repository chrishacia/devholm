import type { Metadata } from 'next';
import type { NextRequest } from 'next/server';
import type React from 'react';

export interface ExtensionHelpers {
  auth: typeof import('@/auth').auth;
  getDb: typeof import('@/db').getDb;
  verifyAdmin: typeof import('@/lib/auth-helpers').verifyAdmin;
}

export interface AdminPageExtension {
  pluginId?: string;
  /** Route href, e.g. '/admin/telemetry' */
  href: `/admin/${string}`;
  /** Dynamic import for the page component */
  loadPage: () => Promise<{ default: React.ComponentType } | React.ComponentType>;
  /** Optional metadata for the dynamic admin page */
  getMetadata?: () => Promise<Metadata> | Metadata;
}

export type ApiExtensionMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';

export interface ApiExtensionContext {
  params: {
    path: string[];
  };
  helpers: ExtensionHelpers;
}

export type ApiExtensionHandler = (
  request: NextRequest,
  context: ApiExtensionContext
) => Promise<Response> | Response;

export interface ApiExtension {
  pluginId?: string;
  /** Route path, e.g. '/api/telemetry' */
  path: `/api/${string}`;
  handlers: Partial<Record<ApiExtensionMethod, ApiExtensionHandler>>;
}

export interface SitemapEntryExtension {
  url: string;
  lastModified?: Date | string;
}

export interface MetadataExtension {
  pluginId?: string;
  /** Public route path, e.g. '/docs' */
  path: `/${string}`;
  getMetadata: (helpers: ExtensionHelpers) => Promise<Metadata> | Metadata;
}

export interface StructuredDataExtension {
  pluginId?: string;
  /** Public route path, e.g. '/docs' */
  path: `/${string}`;
  getData: (
    helpers: ExtensionHelpers
  ) =>
    | Promise<Record<string, unknown> | Record<string, unknown>[]>
    | Record<string, unknown>
    | Record<string, unknown>[];
}

export interface SitemapExtension {
  id: string;
  pluginId?: string;
  getEntries: (
    helpers: ExtensionHelpers
  ) => Promise<SitemapEntryExtension[]> | SitemapEntryExtension[];
}

export interface RobotsExtension {
  id: string;
  pluginId?: string;
  getRules: (helpers: ExtensionHelpers) => Promise<string[]> | string[];
}
