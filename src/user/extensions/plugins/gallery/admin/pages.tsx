import type { Metadata } from 'next';
import type { AdminPageExtension } from '@core/types/extensions.server';
import {
  GALLERY_ADMIN_PAGE_HREF,
  GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
  GALLERY_PERMISSION_ADMIN_MANAGE,
  GALLERY_PLUGIN_ID,
} from '@user/extensions/plugins/gallery/constants';

function createGalleryAdminPageExtension(): AdminPageExtension {
  return {
    pluginId: GALLERY_PLUGIN_ID,
    href: GALLERY_ADMIN_PAGE_HREF,
    accessPolicy: {
      scope: 'admin',
      capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [GALLERY_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'Admin page runtime executes via plugin extension metadata authority.',
    },
    loadPage: async () => import('@/app/admin/gallery/page'),
    getMetadata: async (): Promise<Metadata> => ({
      title: 'Gallery Plugin',
      description: 'Manage gallery collections, media ordering, and publishing options.',
    }),
  };
}

export const galleryAdminPageExtensions: readonly AdminPageExtension[] = [
  createGalleryAdminPageExtension(),
];
