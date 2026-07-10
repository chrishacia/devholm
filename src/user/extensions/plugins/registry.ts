import type { DevholmBundledPlugin } from '@core/types/plugins';
import { calendarPlugin } from '@user/extensions/plugins/calendar';
import { galleryPlugin } from '@user/extensions/plugins/gallery';
import { urlShortenerPlugin } from '@user/extensions/plugins/url-shortener';

export const bundledPlugins: readonly DevholmBundledPlugin[] = [
  calendarPlugin,
  galleryPlugin,
  urlShortenerPlugin,
];
