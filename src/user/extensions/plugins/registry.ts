import type { DevholmBundledPlugin } from '@core/types/plugins';
import { calendarPlugin } from '@user/extensions/plugins/calendar';
import { urlShortenerPlugin } from '@user/extensions/plugins/url-shortener';

export const bundledPlugins: readonly DevholmBundledPlugin[] = [calendarPlugin, urlShortenerPlugin];
