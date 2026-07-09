import type { ApiExtension } from '@core/types/extensions.server';
import {
  GALLERY_ADMIN_API_BASE_PATH,
  GALLERY_API_BASE_PATH,
  GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
  GALLERY_CAPABILITY_PUBLIC_VIEWING,
  GALLERY_PERMISSION_ADMIN_MANAGE,
  GALLERY_PERMISSION_PUBLIC_VIEW,
  GALLERY_PLUGIN_ID,
} from '@user/extensions/plugins/gallery/constants';

// Phase 1/2 metadata-only registration for existing filesystem-owned Gallery APIs.
// Handlers are intentionally empty until Gallery API ownership moves off core routes.
export const galleryApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: GALLERY_PLUGIN_ID,
    path: GALLERY_API_BASE_PATH,
    accessPolicy: {
      scope: 'public',
      capability: GALLERY_CAPABILITY_PUBLIC_VIEWING,
      permissionKeys: [GALLERY_PERMISSION_PUBLIC_VIEW],
      runtimeOwner: 'core-filesystem',
      notes:
        'Runtime ownership remains in existing filesystem routes for public gallery responses in Phase 1/2.',
    },
    handlers: {},
  },
  {
    pluginId: GALLERY_PLUGIN_ID,
    path: GALLERY_ADMIN_API_BASE_PATH,
    accessPolicy: {
      scope: 'admin',
      capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [GALLERY_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'core-filesystem',
      notes:
        'Runtime admin enforcement remains verifyAdmin in existing filesystem routes for Phase 1/2.',
    },
    handlers: {},
  },
];
