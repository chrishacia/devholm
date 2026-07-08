import type { ApiExtension } from '@core/types/extensions.server';
import { urlShortenerApiExtensions } from '@user/extensions/plugins/url-shortener/api';

export const apiExtensions: ApiExtension[] = [...urlShortenerApiExtensions];
