import type { PublicRouteExtension } from '@core/types/extensions.server';
import {
  GALLERY_CAPABILITY_PUBLIC_VIEWING,
  GALLERY_PERMISSION_PUBLIC_VIEW,
  GALLERY_PLUGIN_ID,
  GALLERY_PUBLIC_ROUTE_EXTENSION_ID,
} from '@user/extensions/plugins/gallery/constants';

// Public route adapter remains non-claiming while filesystem page routes exist,
// but sandbox/runtime ownership is now attributed to plugin extension metadata.
export const galleryPublicRouteExtension: PublicRouteExtension<never> = {
  pluginId: GALLERY_PLUGIN_ID,
  id: GALLERY_PUBLIC_ROUTE_EXTENSION_ID,
  accessPolicy: {
    scope: 'public',
    capability: GALLERY_CAPABILITY_PUBLIC_VIEWING,
    permissionKeys: [GALLERY_PERMISSION_PUBLIC_VIEW],
    runtimeOwner: 'plugin-extension',
    notes:
      'Public route adapter intentionally does not claim runtime paths while filesystem page routes stay authoritative.',
  },
  match: async () => null,
  handle: async () => new Response(null, { status: 404 }),
};
