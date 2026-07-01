import { z } from 'zod';
import {
  URL_SHORTENER_ALLOWED_CREATION_MODES,
  URL_SHORTENER_SHORT_CODE_MAX_LENGTH,
  URL_SHORTENER_SHORT_CODE_PATTERN,
} from '@user/extensions/plugins/url-shortener/constants';

export const routePrefixSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^\/[a-zA-Z0-9-]+$/u, 'Prefix must be a single path segment starting with /');

export const shortCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(URL_SHORTENER_SHORT_CODE_MAX_LENGTH)
  .regex(URL_SHORTENER_SHORT_CODE_PATTERN, 'Code must contain only letters, numbers, _ or -');

export const destinationUrlSchema = z
  .string()
  .trim()
  .url('Destination must be a valid URL')
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'Destination URL must use http:// or https://',
  });

export const publicCreationModeSchema = z.enum(URL_SHORTENER_ALLOWED_CREATION_MODES);

export const createShortLinkInputSchema = z.object({
  code: shortCodeSchema.optional(),
  destinationUrl: destinationUrlSchema,
  title: z.string().trim().max(255).optional(),
  publicCreationMode: publicCreationModeSchema.optional(),
});
