import type { z } from 'zod';
import type {
  shortCodeSchema,
  destinationUrlSchema,
  publicCreationModeSchema,
  routePrefixSchema,
} from '@user/extensions/plugins/url-shortener/validation/schemas';

export type UrlShortenerPublicCreationMode = z.infer<typeof publicCreationModeSchema>;

export interface UrlShortenerMatchState {
  code: string;
  prefix: string;
}

export type UrlShortenerRoutePrefix = z.infer<typeof routePrefixSchema>;
export type UrlShortenerShortCode = z.infer<typeof shortCodeSchema>;
export type UrlShortenerDestinationUrl = z.infer<typeof destinationUrlSchema>;
