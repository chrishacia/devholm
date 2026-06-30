#!/usr/bin/env tsx
/**
 * DevHolm CLI
 * ===========
 *
 * Usage:
 *   pnpm devholm <command> [options]
 *
 * Commands:
 *   eject <view>          Copy a core view into src/user/views/ for local override
 *   new:extension <name>  Scaffold a new admin extension
 *   new:migration <name>  Create a new user DB migration file
 *   new:seed <name>       Create a new user DB seed file
 *   list:slots            Print all available extension slot names
 *   status                Print framework structure summary
 *   sync:check            Check if local and committed changes are upstream-sync friendly
 */

import { readdir, copyFile, mkdir, writeFile, stat } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  classifyDownstreamBoundary,
  downstreamBoundaryPolicy,
  parseAllowlistPatterns,
  parseNameOnlyChangedFiles,
  parsePorcelainChangedFiles,
} from '../src/core/lib/sync-policy';

const ROOT = path.resolve(__dirname, '..');
const CORE_VIEWS = path.join(ROOT, 'src/core/views');
const USER_VIEWS = path.join(ROOT, 'src/user/views');
const USER_EXTENSIONS = path.join(ROOT, 'src/user/extensions');
const USER_DB_MIGRATIONS = path.join(ROOT, 'src/user/extensions/db/migrations');
const USER_DB_SEEDS = path.join(ROOT, 'src/user/extensions/db/seeds');
const SYNC_ALLOWLIST_FILE = path.join(ROOT, '.devholm', 'sync-allowlist.txt');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  process.stdout.write(msg + '\n');
}

function error(msg: string): never {
  process.stderr.write('error: ' + msg + '\n');
  process.exit(1);
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function timestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}${h}${min}${s}`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * eject <view>
 *
 * Copies src/core/views/<view>/<ViewName>View.tsx → src/user/views/<view>/<ViewName>View.tsx
 * Then reminds the user to register the override in devholm.config.ts.
 */
async function cmdEject(viewName: string) {
  const VALID_VIEWS = [
    'about',
    'blog',
    'blog-post',
    'contact',
    'home',
    'now',
    'projects',
    'resume',
    'search',
    'uses',
  ];

  if (!VALID_VIEWS.includes(viewName)) {
    error(`Unknown view "${viewName}". Valid views:\n  ${VALID_VIEWS.join(', ')}`);
  }

  // Map view name to directory and component file name
  const dirMap: Record<string, { dir: string; file: string }> = {
    about: { dir: 'about', file: 'AboutView.tsx' },
    blog: { dir: 'blog', file: 'BlogView.tsx' },
    'blog-post': { dir: 'blog/post', file: 'BlogPostView.tsx' },
    contact: { dir: 'contact', file: 'ContactView.tsx' },
    home: { dir: 'home', file: 'HomeView.tsx' },
    now: { dir: 'now', file: 'NowView.tsx' },
    projects: { dir: 'projects', file: 'ProjectsView.tsx' },
    resume: { dir: 'resume', file: 'ResumeView.tsx' },
    search: { dir: 'search', file: 'SearchView.tsx' },
    uses: { dir: 'uses', file: 'UsesView.tsx' },
  };

  const { dir, file } = dirMap[viewName];
  const srcFile = path.join(CORE_VIEWS, dir, file);
  const destDir = path.join(USER_VIEWS, dir);
  const destFile = path.join(destDir, file);

  // Check source exists
  if (!existsSync(srcFile)) {
    error(`Core view not found: ${srcFile}`);
  }

  // Don't overwrite
  if (existsSync(destFile)) {
    error(`User override already exists: ${destFile}\nDelete it first to re-eject.`);
  }

  await ensureDir(destDir);
  await copyFile(srcFile, destFile);

  log(`✓ Ejected ${viewName} view to:`);
  log(`    ${destFile.replace(ROOT + '/', '')}`);
  log('');
  log('Next: register the override in devholm.config.ts:');
  log('');
  log(`  views: {`);
  log(`    '${viewName}': () => import('./src/user/views/${dir}/${file}').then(m => m.default),`);
  log(`  },`);
}

/**
 * new:extension <name>
 *
 * Scaffolds a new admin extension in src/user/extensions/admin/<name>/.
 */
async function cmdNewExtension(name: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    error(`Extension name must be kebab-case lowercase, e.g. "my-feature". Got: "${name}"`);
  }

  const extDir = path.join(USER_EXTENSIONS, 'admin', name);
  if (existsSync(extDir)) {
    error(`Extension directory already exists: ${extDir}`);
  }

  const componentName =
    name
      .split('-')
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('') + 'Dashboard';

  await ensureDir(extDir);

  // Component file
  await writeFile(
    path.join(extDir, `${componentName}.tsx`),
    `'use client';

import { Box, Typography } from '@mui/material';

export default function ${componentName}() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        ${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ')}
      </Typography>
      <Typography color="text.secondary">
        Your ${name} content goes here.
      </Typography>
    </Box>
  );
}
`
  );

  log(`✓ Created extension component:`);
  log(`    src/user/extensions/admin/${name}/${componentName}.tsx`);
  log('');
  log('Next steps:');
  log('  1. Register nav in src/user/extensions/admin/index.tsx:');
  log(
    "     { navItem: { label: '...', href: '/admin/${name}', icon: <YourIcon />, position: 'after:analytics' } }"
  );
  log('');
  log('  2. Register page module in src/user/extensions/admin/pages.tsx:');
  log('     {');
  log("       href: '/admin/${name}',");
  log(`       loadPage: () => import('./${name}/${componentName}'),`);
  log("       getMetadata: () => ({ title: '...', description: '...' }),");
  log('     }');
  log('');
  log('  3. Open /admin/${name} (handled by src/app/admin/[...slug]/page.tsx).');
}

/**
 * new:migration <name>
 *
 * Creates a new timestamped migration file in src/user/extensions/db/migrations/.
 */
async function cmdNewMigration(name: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    error(`Migration name must be snake_case lowercase, e.g. "add_feature_table". Got: "${name}"`);
  }

  await ensureDir(USER_DB_MIGRATIONS);

  const ts = timestamp();
  const fileName = `u_${ts}_${name}.ts`;
  const filePath = path.join(USER_DB_MIGRATIONS, fileName);

  await writeFile(
    filePath,
    `import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // TODO: implement migration
  // await knex.schema.createTable('${name}', (table) => {
  //   table.increments('id').primary();
  //   table.timestamps(true, true);
  // });
}

export async function down(knex: Knex): Promise<void> {
  // TODO: implement rollback
  // await knex.schema.dropTableIfExists('${name}');
}
`
  );

  log(`✓ Created migration:`);
  log(`    src/user/extensions/db/migrations/${fileName}`);
}

/**
 * new:seed <name>
 *
 * Creates a new user seed file in src/user/extensions/db/seeds/.
 */
async function cmdNewSeed(name: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    error(`Seed name must be kebab-case lowercase, e.g. "my-feature". Got: "${name}"`);
  }

  await ensureDir(USER_DB_SEEDS);

  const fileName = `${name}.ts`;
  const filePath = path.join(USER_DB_SEEDS, fileName);

  if (existsSync(filePath)) {
    error(`User seed already exists: ${filePath}`);
  }

  await writeFile(
    filePath,
    `import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // TODO: implement user seed
  // await knex('your_table').insert({
  //   key: '${name}',
  // });
}
`
  );

  log(`✓ Created seed:`);
  log(`    src/user/extensions/db/seeds/${fileName}`);
  log('');
  log('Run it with:');
  log(`  pnpm db:seed:user -- --specific=${fileName}`);
}

/**
 * list:slots
 *
 * Prints all valid SlotName values.
 */
async function cmdListSlots() {
  const SLOTS = [
    'home.hero.below',
    'home.sidebar.top',
    'home.sidebar.bottom',
    'home.below',
    'blog.aboveList',
    'blog.belowList',
    'blog.sidebar.top',
    'blog.sidebar.bottom',
    'blog.post.aboveContent',
    'blog.post.belowContent',
    'blog.post.sidebar',
    'projects.aboveList',
    'projects.belowList',
    'resume.top',
    'resume.bottom',
    'admin.dashboard.top',
    'admin.dashboard.bottom',
  ];

  log('Available extension slots:');
  log('');
  for (const slot of SLOTS) {
    log(`  ${slot}`);
  }
  log('');
  log('Register slots in devholm.config.ts → slots:');
  log('');
  log('  slots: {');
  log("    'home.hero.below': () => import('./src/user/slots/HomeBanner').then(m => m.default),");
  log('  },');
}

/**
 * status
 *
 * Prints a summary of the current framework structure.
 */
async function cmdStatus() {
  log('DevHolm Framework Status');
  log('========================');
  log('');

  // Check core views
  log('Core views (src/core/views/):');
  const viewDirs = await readdir(CORE_VIEWS);
  for (const v of viewDirs.sort()) {
    const viewPath = path.join(CORE_VIEWS, v);
    const s = await stat(viewPath);
    if (s.isDirectory()) {
      log(`  ✓ ${v}`);
    }
  }
  log('');

  // Check user views (ejected)
  log('User view overrides (src/user/views/):');
  if (existsSync(USER_VIEWS)) {
    const userViewDirs = await readdir(USER_VIEWS);
    const ejected = [];
    for (const v of userViewDirs.sort()) {
      const s = await stat(path.join(USER_VIEWS, v));
      if (s.isDirectory()) ejected.push(v);
    }
    if (ejected.length === 0) {
      log('  (none)');
    } else {
      for (const v of ejected) {
        log(`  • ${v}  [ejected]`);
      }
    }
  } else {
    log('  (none)');
  }
  log('');

  // Check user extensions
  log('User extensions (src/user/extensions/):');
  const adminExtDir = path.join(USER_EXTENSIONS, 'admin');
  if (existsSync(adminExtDir)) {
    const adminItems = await readdir(adminExtDir);
    const extensionItems = adminItems.filter((f) => !f.endsWith('.tsx') && !f.endsWith('.ts'));
    for (const item of extensionItems) {
      log(`  • admin/${item}`);
    }
  }
  const dbMigrationsDir = USER_DB_MIGRATIONS;
  if (existsSync(dbMigrationsDir)) {
    const migrations = await readdir(dbMigrationsDir);
    log(`  • db/migrations  (${migrations.length} migration${migrations.length !== 1 ? 's' : ''})`);
  }
  if (existsSync(USER_DB_SEEDS)) {
    const seeds = (await readdir(USER_DB_SEEDS)).filter((file) => file.endsWith('.ts'));
    log(`  • db/seeds       (${seeds.length} seed${seeds.length !== 1 ? 's' : ''})`);
  }
  log('');
}

/**
 * sync:check [--against <ref>] [--working-tree-only]
 *
 * Reports whether local edits and committed drift stay inside user-owned
 * boundaries, which keeps downstream repos easy to update from upstream.
 */
async function cmdSyncCheck(args: string[] = []) {
  let againstRef: string | null = null;
  let workingTreeOnly = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--working-tree-only') {
      workingTreeOnly = true;
      continue;
    }

    if (arg === '--against') {
      const nextValue = args[i + 1];
      if (!nextValue) {
        error('Usage: pnpm devholm sync:check --against <git-ref>');
      }
      againstRef = nextValue;
      i += 1;
      continue;
    }

    if (arg.startsWith('--against=')) {
      againstRef = arg.slice('--against='.length);
      continue;
    }

    error(`Unknown sync:check option "${arg}".`);
  }

  let remotes = '';
  try {
    remotes = execSync('git remote', { encoding: 'utf8' }).trim();
  } catch {
    error('Not inside a git repository, cannot run sync:check.');
  }

  const remoteList = remotes ? remotes.split(/\s+/).filter(Boolean) : [];
  const hasUpstream = remoteList.includes('upstream');
  const hasTemplate = remoteList.includes('template');

  const selectedBaselineRef = workingTreeOnly
    ? null
    : againstRef ?? (hasTemplate ? 'template/main' : hasUpstream ? 'upstream/main' : null);

  if (againstRef) {
    try {
      execSync(`git rev-parse --verify --quiet ${againstRef}`, { encoding: 'utf8' });
    } catch {
      error(`Invalid --against ref "${againstRef}".`);
    }
  }

  let statusOutput = '';
  try {
    statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
  } catch {
    error('Unable to read git status.');
  }

  const allowlistPatterns = existsSync(SYNC_ALLOWLIST_FILE)
    ? parseAllowlistPatterns(readFileSync(SYNC_ALLOWLIST_FILE, 'utf8'))
    : [];

  const workingTreeFiles = parsePorcelainChangedFiles(statusOutput);
  const { safeFiles: safeWorkingTreeFiles, unsafeFiles: unsafeWorkingTreeFiles } =
    classifyDownstreamBoundary(workingTreeFiles, allowlistPatterns);

  let baselineFiles: string[] = [];
  let safeBaselineFiles: string[] = [];
  let unsafeBaselineFiles: string[] = [];

  if (selectedBaselineRef) {
    try {
      let baselineDiff = '';
      try {
        baselineDiff = execSync(
          `git diff --name-only --diff-filter=ACMR ${selectedBaselineRef}...HEAD`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
      } catch (mergeBaseError) {
        const details =
          mergeBaseError instanceof Error
            ? mergeBaseError.message.toLowerCase()
            : String(mergeBaseError);

        if (!details.includes('no merge base')) {
          throw mergeBaseError;
        }

        log(
          `warning: no merge base with ${selectedBaselineRef}; falling back to direct diff (${selectedBaselineRef}..HEAD).`
        );
        baselineDiff = execSync(
          `git diff --name-only --diff-filter=ACMR ${selectedBaselineRef}..HEAD`,
          { encoding: 'utf8' }
        );
      }

      baselineFiles = parseNameOnlyChangedFiles(baselineDiff);
      const classified = classifyDownstreamBoundary(baselineFiles, allowlistPatterns);
      safeBaselineFiles = classified.safeFiles;
      unsafeBaselineFiles = classified.unsafeFiles;
    } catch {
      if (!againstRef) {
        log(
          `warning: unable to diff against ${selectedBaselineRef}; running working-tree-only checks.`
        );
      } else {
        error(`Unable to diff against --against ref "${selectedBaselineRef}".`);
      }
    }
  }

  const hasUnsafe = unsafeWorkingTreeFiles.length > 0 || unsafeBaselineFiles.length > 0;

  log('DevHolm Upstream Sync Check');
  log('==========================');
  log('');
  log(`upstream remote: ${hasUpstream ? 'configured' : 'missing'}`);
  if (!hasUpstream) {
    log('  add it with: git remote add upstream https://github.com/devholm/devholm.com.git');
  }
  log(`template remote: ${hasTemplate ? 'configured' : 'missing'}`);
  if (!hasTemplate) {
    log('  add it with: git remote add template https://github.com/devholm/devholm.com.git');
  }
  log(`baseline ref: ${selectedBaselineRef ?? 'none (working-tree-only)'}`);
  log(`allowlist: ${allowlistPatterns.length > 0 ? '.devholm/sync-allowlist.txt' : 'none'}`);
  log(`working tree changes: ${workingTreeFiles.length}`);
  if (selectedBaselineRef) {
    log(`committed changes vs ${selectedBaselineRef}: ${baselineFiles.length}`);
  }
  log('');

  if (workingTreeFiles.length === 0 && baselineFiles.length === 0) {
    log('No downstream changes detected outside baseline. You are ready to pull from upstream.');
    return;
  }

  if (!hasUnsafe) {
    log('All checked changes are in downstream-safe boundaries.');
    log('Pull/merge from upstream should stay low-conflict if migrations are applied.');
    return;
  }

  log('Downstream-safe boundaries:');
  log(`  prefixes: ${downstreamBoundaryPolicy.safePrefixes.join(', ')}`);
  log(`  exact files: ${downstreamBoundaryPolicy.safeExact.join(', ')}`);
  log('');

  if (unsafeWorkingTreeFiles.length > 0) {
    log('Found working-tree edits outside downstream-safe boundaries:');
    for (const filePath of unsafeWorkingTreeFiles) {
      log(`  - ${filePath}`);
    }
    log('');
  }

  if (unsafeBaselineFiles.length > 0) {
    log(`Found committed drift outside downstream-safe boundaries vs ${selectedBaselineRef}:`);
    for (const filePath of unsafeBaselineFiles) {
      log(`  - ${filePath}`);
    }
    log('');
  }

  if (safeWorkingTreeFiles.length > 0) {
    log('Working-tree edits inside safe boundaries:');
    for (const filePath of safeWorkingTreeFiles) {
      log(`  + ${filePath}`);
    }
    log('');
  }

  if (safeBaselineFiles.length > 0) {
    log(`Committed changes inside safe boundaries vs ${selectedBaselineRef}:`);
    for (const filePath of safeBaselineFiles) {
      log(`  + ${filePath}`);
    }
    log('');
  }

  log(
    'Recommendation: move site-specific customization into src/user/ or devholm.config.ts before syncing upstream.'
  );
  process.exitCode = 2;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    log('Usage: pnpm devholm <command> [options]');
    log('');
    log('Commands:');
    log('  eject <view>          Copy a core view into src/user/views/ for local customization');
    log('  new:extension <name>  Scaffold a new admin extension');
    log('  new:migration <name>  Create a new user DB migration file');
    log('  new:seed <name>       Create a new user DB seed file');
    log('  list:slots            Print all available extension slot names');
    log('  status                Print framework structure summary');
    log('  sync:check            Check local + committed changes for upstream sync safety');
    log('    --against <ref>     Compare committed drift against git ref (e.g. template/main)');
    log('    --working-tree-only Skip committed drift comparison');
    return;
  }

  switch (command) {
    case 'eject':
      if (!args[0]) error('Usage: pnpm devholm eject <view>');
      await cmdEject(args[0]);
      break;
    case 'new:extension':
      if (!args[0]) error('Usage: pnpm devholm new:extension <name>');
      await cmdNewExtension(args[0]);
      break;
    case 'new:migration':
      if (!args[0]) error('Usage: pnpm devholm new:migration <name>');
      await cmdNewMigration(args[0]);
      break;
    case 'new:seed':
      if (!args[0]) error('Usage: pnpm devholm new:seed <name>');
      await cmdNewSeed(args[0]);
      break;
    case 'list:slots':
      await cmdListSlots();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'sync:check':
      await cmdSyncCheck(args);
      break;
    default:
      error(`Unknown command "${command}". Run "pnpm devholm --help" for usage.`);
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
