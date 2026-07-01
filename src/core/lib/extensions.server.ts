import type React from 'react';
import type { Metadata } from 'next';
import type { NextRequest } from 'next/server';
import type {
  AdminPageExtension,
  ApiExtension,
  ApiExtensionMethod,
  MetadataExtension,
  RobotsExtension,
  SitemapExtension,
  StructuredDataExtension,
} from '@core/types/extensions.server';
import { adminPageExtensions } from '@user/extensions/admin/pages';
import { apiExtensions } from '@user/extensions/api';
import {
  metadataExtensions,
  robotsExtensions,
  sitemapExtensions,
  structuredDataExtensions,
} from '@user/extensions/seo';
import { isPluginEnabled } from '@/db/plugins';
import { getExtensionHelpers } from '@core/lib/extension-helpers.server';

function normalizePath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return '/' + segments.join('/');
}

function resolveByPath<T extends { href?: string; path?: string }>(
  extensions: T[],
  candidatePath: string
): T | undefined {
  const normalizedCandidate = normalizePath(candidatePath);
  return extensions.find((extension) => {
    const extensionPath = 'href' in extension ? extension.href : extension.path;
    return extensionPath ? normalizePath(extensionPath) === normalizedCandidate : false;
  });
}

function hasDefaultExport(
  module: Awaited<ReturnType<AdminPageExtension['loadPage']>>
): module is { default: React.ComponentType } {
  return typeof module === 'object' && module !== null && 'default' in module;
}

async function isExtensionEnabled(pluginId?: string): Promise<boolean> {
  if (!pluginId) {
    return true;
  }

  return isPluginEnabled(pluginId);
}

export function resolveAdminPageExtension(slug: string[]): AdminPageExtension | undefined {
  return resolveByPath(adminPageExtensions, `/admin/${slug.join('/')}`);
}

export async function getAdminPageComponent(slug: string[]): Promise<React.ComponentType | null> {
  const extension = resolveAdminPageExtension(slug);
  if (!extension) {
    return null;
  }

  // Enforce plugin enablement check
  if (!(await isExtensionEnabled(extension.pluginId))) {
    return null;
  }

  const loadedModule = await extension.loadPage();
  return hasDefaultExport(loadedModule) ? loadedModule.default : loadedModule;
}

export async function getAdminPageMetadata(slug: string[]): Promise<Metadata | undefined> {
  const extension = resolveAdminPageExtension(slug);
  if (!extension) {
    return undefined;
  }

  // Enforce plugin enablement check
  if (!(await isExtensionEnabled(extension.pluginId))) {
    return undefined;
  }

  return extension?.getMetadata ? extension.getMetadata() : undefined;
}

export function resolveMetadataExtensions(path: string): MetadataExtension[] {
  const normalizedCandidate = normalizePath(path);
  return metadataExtensions.filter(
    (extension) => normalizePath(extension.path) === normalizedCandidate
  );
}

export async function getMetadataExtensionData(path: string): Promise<Metadata[]> {
  const helpers = getExtensionHelpers();
  const extensions = await Promise.all(
    resolveMetadataExtensions(path).map(async (extension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );

  return Promise.all(
    extensions
      .filter((extension): extension is MetadataExtension => extension !== null)
      .map((extension) => extension.getMetadata(helpers))
  );
}

export function resolveStructuredDataExtensions(path: string): StructuredDataExtension[] {
  const normalizedCandidate = normalizePath(path);
  return structuredDataExtensions.filter(
    (extension) => normalizePath(extension.path) === normalizedCandidate
  );
}

export async function getStructuredDataExtensionData(
  path: string
): Promise<Record<string, unknown>[]> {
  const helpers = getExtensionHelpers();
  const extensions = await Promise.all(
    resolveStructuredDataExtensions(path).map(async (extension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    extensions
      .filter((extension): extension is StructuredDataExtension => extension !== null)
      .map((extension) => extension.getData(helpers))
  );
  return resolved.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

export async function getSitemapExtensionEntries() {
  const helpers = getExtensionHelpers();
  const enabledExtensions = await Promise.all(
    sitemapExtensions.map(async (extension: SitemapExtension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    enabledExtensions
      .filter((extension): extension is SitemapExtension => extension !== null)
      .map((extension) => extension.getEntries(helpers))
  );
  return resolved.flat();
}

export async function getRobotsExtensionRules() {
  const helpers = getExtensionHelpers();
  const enabledExtensions = await Promise.all(
    robotsExtensions.map(async (extension: RobotsExtension) => {
      if (!(await isExtensionEnabled(extension.pluginId))) {
        return null;
      }

      return extension;
    })
  );
  const resolved = await Promise.all(
    enabledExtensions
      .filter((extension): extension is RobotsExtension => extension !== null)
      .map((extension) => extension.getRules(helpers))
  );
  return resolved.flat();
}

export function resolveApiExtension(path: string[]): ApiExtension | undefined {
  return resolveByPath(apiExtensions, `/api/${path.join('/')}`);
}

export async function runApiExtension(
  method: ApiExtensionMethod,
  request: NextRequest,
  path: string[]
): Promise<Response | null> {
  const extension = resolveApiExtension(path);
  if (!extension) {
    return null;
  }

  if (!(await isExtensionEnabled(extension.pluginId))) {
    return null;
  }

  const handler = extension.handlers[method];
  if (!handler) {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return handler(request, {
    params: { path },
    helpers: getExtensionHelpers(),
  });
}
