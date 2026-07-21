import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  buildFirstPartyMarketplaceContract,
  type FirstPartyMarketplaceContractDocument,
} from '@/core/plugins/first-party-marketplace-contract';

function stringifyStable(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  const outputPath = path.resolve(
    process.cwd(),
    'contracts/marketplace-first-party-canonical.json'
  );
  await mkdir(path.dirname(outputPath), { recursive: true });

  const document: FirstPartyMarketplaceContractDocument = buildFirstPartyMarketplaceContract();
  await writeFile(outputPath, stringifyStable(document), 'utf8');

  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
