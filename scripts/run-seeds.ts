#!/usr/bin/env tsx

/* eslint-disable @typescript-eslint/no-require-imports */
import knex from 'knex';

type SeedProfile = 'all' | 'bootstrap' | 'demo' | 'user';

const SEED_DIRECTORIES: Record<Exclude<SeedProfile, 'all'>, string[]> = {
  bootstrap: ['./src/core/db/seeds/bootstrap'],
  demo: ['./src/core/db/seeds/demo'],
  user: ['./src/user/extensions/db/seeds'],
};

function log(message: string) {
  process.stdout.write(message + '\n');
}

function fail(message: string): never {
  process.stderr.write('error: ' + message + '\n');
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const profile = (argv[0] || 'all') as SeedProfile;
  const specific = argv
    .slice(1)
    .find((arg) => arg.startsWith('--specific='))
    ?.slice('--specific='.length)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!['all', 'bootstrap', 'demo', 'user'].includes(profile)) {
    fail(`Unknown seed profile "${profile}". Expected one of: all, bootstrap, demo, user.`);
  }

  return { profile, specific };
}

function resolveDirectories(profile: SeedProfile): string[] {
  if (profile === 'all') {
    return [...SEED_DIRECTORIES.bootstrap, ...SEED_DIRECTORIES.demo, ...SEED_DIRECTORIES.user];
  }

  return SEED_DIRECTORIES[profile];
}

export async function runSeedProfile(profile: SeedProfile, specificSeeds: string[] = []) {
  const env = process.env.NODE_ENV || 'development';
  const knexConfig = require('../knexfile.js');
  const config = knexConfig[env];

  if (!config) {
    fail(`No knex configuration found for environment "${env}".`);
  }

  const directories = resolveDirectories(profile);
  log(`Running ${profile} seeds in ${env}...`);
  directories.forEach((directory) => log(`  - ${directory}`));
  if (specificSeeds.length) {
    log(`Specific seeds: ${specificSeeds.join(', ')}`);
  }

  const db = knex(config);

  try {
    const [seeds] = await db.seed.run({
      directory: directories,
      extension: 'ts',
      loadExtensions: ['.ts'],
      recursive: true,
      sortDirsSeparately: true,
      specific: specificSeeds[0],
    });

    if (!seeds.length) {
      log('No seeds were executed.');
    } else {
      log(`Executed ${seeds.length} seed${seeds.length === 1 ? '' : 's'}:`);
      seeds.forEach((seedFile) => log(`  ✓ ${seedFile}`));
    }
  } finally {
    await db.destroy();
  }
}

async function main() {
  const { profile, specific } = parseArgs(process.argv.slice(2));
  await runSeedProfile(profile, specific ?? []);
}

main().catch((error) => {
  process.stderr.write(String(error) + '\n');
  process.exit(1);
});
