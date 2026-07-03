import type { DevholmBundledPlugin } from '@core/types/plugins';
import { urlShortenerPlugin } from '@user/extensions/plugins/url-shortener';

export const bundledPlugins: readonly DevholmBundledPlugin[] = [urlShortenerPlugin];
