import { describe, expect, it } from 'vitest';
import { getPluginDefinitions } from '@core/lib/plugins';
import { buildNavItems, CORE_NAV_ITEMS } from '@/app/admin/AdminLayoutClient';
import {
  GALLERY_ADMIN_PAGE_HREF,
  GALLERY_PLUGIN_ID,
} from '@user/extensions/plugins/gallery/constants';
import { galleryAdminPageExtensions } from '@user/extensions/plugins/gallery/admin/pages';

type PluginAdminNavItem = {
  pluginId: string;
  href: string;
  label: string;
};

describe('gallery phase 4 admin page/nav metadata bridge', () => {
  it('keeps gallery admin page metadata and href anchored to /admin/gallery', () => {
    const galleryPage = galleryAdminPageExtensions.find(
      (item) => item.pluginId === GALLERY_PLUGIN_ID
    );

    expect(galleryPage).toBeDefined();
    expect(galleryPage?.href).toBe(GALLERY_ADMIN_PAGE_HREF);
    expect(galleryPage?.accessPolicy?.runtimeOwner).toBe('plugin-extension');
  });

  it('derives gallery admin nav discoverability from plugin metadata (not hardcoded core nav)', () => {
    expect(CORE_NAV_ITEMS.some((item) => item.href === GALLERY_ADMIN_PAGE_HREF)).toBe(false);

    const pluginNavItems: PluginAdminNavItem[] = getPluginDefinitions()
      .filter((plugin) => plugin.capabilities?.navigation && plugin.adminSurface?.href)
      .map((plugin) => ({
        pluginId: plugin.id,
        href: plugin.adminSurface?.href ?? `/admin/${plugin.id}`,
        label: plugin.adminSurface?.label || plugin.name,
      }));

    const enabledNav = buildNavItems(
      {
        gallery: true,
        calendar: true,
        'url-shortener': true,
      },
      pluginNavItems
    );

    expect(enabledNav.map((item) => item.href)).toEqual(
      expect.arrayContaining(['/admin/gallery', '/admin/calendar', '/admin/url-shortener/overview'])
    );

    const disabledGalleryNav = buildNavItems(
      {
        gallery: false,
        calendar: true,
        'url-shortener': true,
      },
      pluginNavItems
    );

    expect(disabledGalleryNav.some((item) => item.href === '/admin/gallery')).toBe(false);
    expect(disabledGalleryNav.map((item) => item.href)).toEqual(
      expect.arrayContaining(['/admin/calendar', '/admin/url-shortener/overview'])
    );
  });

  it('does not reintroduce gallery as a direct core plugin definition', () => {
    const definitions = getPluginDefinitions();

    expect(
      definitions.some((item) => item.id === GALLERY_PLUGIN_ID && item.source === 'core')
    ).toBe(false);

    const galleryDefinition = definitions.find((item) => item.id === GALLERY_PLUGIN_ID);
    expect(galleryDefinition?.source).toBe('user');
    expect(galleryDefinition?.adminSurface?.href).toBe(GALLERY_ADMIN_PAGE_HREF);
    expect(galleryDefinition?.capabilities?.navigation).toBe(true);
  });
});
