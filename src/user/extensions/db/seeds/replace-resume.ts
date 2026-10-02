import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import {
  getResumeImportPreview,
  replaceResumeFromImport,
  restoreResumeFromBackup,
  validateResumeImportInput,
} from '@/db/resume-import';
import { closeDb } from '@/db';

function printPreview(label: string, preview: Awaited<ReturnType<typeof getResumeImportPreview>>) {
  console.log(`\n${label}`);
  console.log(`Target: ${preview.target.database}.${preview.target.schema}`);
  console.table({
    current_skills: preview.current_counts.skills,
    input_skills: preview.input_counts.skills,
    current_experiences: preview.current_counts.experiences,
    input_experiences: preview.input_counts.experiences,
    current_highlights: preview.current_counts.experience_highlights,
    input_highlights: preview.input_counts.experience_highlights,
    current_technologies: preview.current_counts.experience_technologies,
    input_technologies: preview.input_counts.experience_technologies,
    current_education: preview.current_counts.education,
    input_education: preview.input_counts.education,
    current_certifications: preview.current_counts.certifications,
    input_certifications: preview.input_counts.certifications,
  });
}

function parseArgValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function run() {
  const inputPath =
    parseArgValue('--input') ??
    path.join(process.cwd(), 'src/user/extensions/db/seeds/resume.json');
  const restorePath = parseArgValue('--restore');
  const apply = hasFlag('--apply');

  if (restorePath) {
    const restoreRaw = await readFile(path.resolve(restorePath), 'utf8');
    const restorePayload = JSON.parse(restoreRaw);
    const restored = await restoreResumeFromBackup(restorePayload);
    printPreview('Resume restore completed', restored.preview);
    return;
  }

  const raw = await readFile(path.resolve(inputPath), 'utf8');
  const parsedInput = validateResumeImportInput(JSON.parse(raw));
  const preview = await getResumeImportPreview(parsedInput);
  printPreview('Resume import preview', preview);

  if (!apply) {
    console.log('\nDry run complete. Re-run with --apply to replace resume data.');
    return;
  }

  const result = await replaceResumeFromImport(parsedInput);
  printPreview('Resume import applied', result.preview);

  const backupDir = path.join(process.cwd(), 'src/user/extensions/db/seeds/backups');
  await mkdir(backupDir, { recursive: true });

  const backupPath =
    parseArgValue('--backup-out') ??
    path.join(backupDir, `resume-backup-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`);

  await writeFile(backupPath, `${JSON.stringify(result.backup, null, 2)}\n`, 'utf8');
  console.log(`Backup written to ${backupPath}`);
}

run()
  .catch((error) => {
    console.error('Resume replacement failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
