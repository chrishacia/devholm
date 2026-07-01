import type { LinkRepository } from '@user/extensions/plugins/url-shortener/repositories/interfaces';

export class ShortLinkService {
  constructor(private readonly links: LinkRepository) {}

  async resolveByCode(code: string): Promise<unknown | null> {
    return this.links.getByCode(code);
  }

  async createPlaceholderLink(input: {
    code: string;
    destinationUrl: string;
    title?: string;
  }): Promise<unknown> {
    return this.links.create(input);
  }
}
