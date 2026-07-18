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
import {
  handleGalleryAdminCollectionById,
  handleGalleryAdminCollectionItems,
  handleGalleryAdminCollectionRoot,
  handleGalleryAdminItemById,
  handleGalleryPublicApi,
} from '@user/extensions/plugins/gallery/api/handlers';

function unknownEndpoint() {
  return Response.json({ error: 'Unknown gallery admin API endpoint' }, { status: 404 });
}

function galleryAdminPathSegments(path: string[]) {
  if (path[0] !== 'admin' || path[1] !== 'gallery') {
    return null;
  }

  return path.slice(2);
}

export const galleryApiExtensions: readonly ApiExtension[] = [
  {
    pluginId: GALLERY_PLUGIN_ID,
    path: GALLERY_API_BASE_PATH,
    accessPolicy: {
      scope: 'public',
      capability: GALLERY_CAPABILITY_PUBLIC_VIEWING,
      permissionKeys: [GALLERY_PERMISSION_PUBLIC_VIEW],
      runtimeOwner: 'plugin-extension',
      notes: 'Public Gallery API runtime executes in plugin extension module context.',
    },
    handlers: {
      GET: async (request, context) => {
        return handleGalleryPublicApi('GET', request, context.params.path.slice(1));
      },
    },
  },
  {
    pluginId: GALLERY_PLUGIN_ID,
    path: GALLERY_ADMIN_API_BASE_PATH,
    accessPolicy: {
      scope: 'admin',
      capability: GALLERY_CAPABILITY_ADMIN_MANAGEMENT,
      permissionKeys: [GALLERY_PERMISSION_ADMIN_MANAGE],
      runtimeOwner: 'plugin-extension',
      notes: 'Gallery admin API runtime executes in plugin extension module context.',
    },
    handlers: {
      GET: async (request, context) => {
        const path = galleryAdminPathSegments(context.params.path);
        if (!path) {
          return unknownEndpoint();
        }

        if (path.length === 0) {
          return handleGalleryAdminCollectionRoot('GET', request, {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        if (path.length === 1 && path[0] !== 'items') {
          return handleGalleryAdminCollectionById('GET', request, path[0], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        if (path.length === 2 && path[1] === 'items') {
          return handleGalleryAdminCollectionItems('GET', request, path[0], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        return unknownEndpoint();
      },
      POST: async (request, context) => {
        const path = galleryAdminPathSegments(context.params.path);
        if (!path) {
          return unknownEndpoint();
        }

        if (path.length === 0) {
          return handleGalleryAdminCollectionRoot('POST', request, {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        if (path.length === 2 && path[1] === 'items') {
          return handleGalleryAdminCollectionItems('POST', request, path[0], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        return unknownEndpoint();
      },
      PUT: async (request, context) => {
        const path = galleryAdminPathSegments(context.params.path);
        if (!path) {
          return unknownEndpoint();
        }

        if (path.length === 1 && path[0] !== 'items') {
          return handleGalleryAdminCollectionById('PUT', request, path[0], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        if (path.length === 2 && path[0] === 'items') {
          return handleGalleryAdminItemById('PUT', request, path[1], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        return unknownEndpoint();
      },
      DELETE: async (request, context) => {
        const path = galleryAdminPathSegments(context.params.path);
        if (!path) {
          return unknownEndpoint();
        }

        if (path.length === 1 && path[0] !== 'items') {
          return handleGalleryAdminCollectionById('DELETE', request, path[0], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        if (path.length === 2 && path[0] === 'items') {
          return handleGalleryAdminItemById('DELETE', request, path[1], {
            verifyAdmin: context.helpers.verifyAdmin,
          });
        }

        return unknownEndpoint();
      },
    },
  },
];
