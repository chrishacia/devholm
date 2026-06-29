import type { Metadata } from 'next';
import type React from 'react';

export interface DevPageDefinition {
  key: string;
  path: `/${string}`;
  title: string;
  description?: string;
  loadPage: () => Promise<{ default: React.ComponentType } | React.ComponentType>;
  getMetadata?: () => Promise<Metadata> | Metadata;
  enabledByDefault?: boolean;
  showInMainNavByDefault?: boolean;
  showInFooterMainByDefault?: boolean;
  showInFooterResourcesByDefault?: boolean;
  includeInSitemapByDefault?: boolean;
  navLabelByDefault?: string;
}

export interface DevPageRuntimeState {
  pageKey: string;
  path: string;
  title: string;
  navLabel: string | null;
  isEnabled: boolean;
  showInMainNav: boolean;
  showInFooterMain: boolean;
  showInFooterResources: boolean;
  includeInSitemap: boolean;
  updatedAt: Date;
}

export interface NavigationLink {
  label: string;
  href: string;
}
