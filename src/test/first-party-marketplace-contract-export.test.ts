import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFirstPartyMarketplaceContract,
  type FirstPartyMarketplaceContractDocument,
} from '@core/plugins/first-party-marketplace-contract';

function readExport(): FirstPartyMarketplaceContractDocument {
  const filePath = path.resolve(process.cwd(), 'contracts/marketplace-first-party-canonical.json');
  return JSON.parse(readFileSync(filePath, 'utf8')) as FirstPartyMarketplaceContractDocument;
}

describe('first-party marketplace contract export', () => {
  it('matches generated contract from runtime plugin definitions', () => {
    const expected = buildFirstPartyMarketplaceContract();
    const exported = readExport();
    expect(exported).toEqual(expected);
  });

  it('contains only stock plugin IDs and deterministic ordering', () => {
    const exported = readExport();
    const ids = exported.plugins.map((plugin) => plugin.pluginId);
    expect(ids).toEqual(['calendar', 'gallery', 'url-shortener']);
  });

  it('contains no marketplace-only presentation fields', () => {
    const exported = readExport();
    for (const plugin of exported.plugins) {
      const unsafeView = plugin as unknown as Record<string, unknown>;
      expect(unsafeView.icon).toBeUndefined();
      expect(unsafeView.screenshots).toBeUndefined();
      expect(unsafeView.landingPage).toBeUndefined();
      expect(unsafeView.trustDisclosure).toBeUndefined();
    }
  });

  it('contains no artifact trust claims', () => {
    const exported = readExport();
    for (const plugin of exported.plugins) {
      const unsafeView = plugin as unknown as Record<string, unknown>;
      expect(unsafeView.artifact).toBeUndefined();
      expect(unsafeView.digest).toBeUndefined();
      expect(unsafeView.signature).toBeUndefined();
    }
  });
});
