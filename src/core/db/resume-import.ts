import { z } from 'zod';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { getDb } from './index';

const monthDateRegex = /^\d{4}-\d{2}-\d{2}$/u;

const nonEmptyString = z.string().trim().min(1);

const nullableNonEmptyString = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable();

const dateStringSchema = z
  .string()
  .regex(monthDateRegex, 'Dates must use YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date value');

const resumeProfileSchema = z.object({
  name: nonEmptyString,
  headline: nonEmptyString,
  summary: nonEmptyString,
  category_order: z.array(nonEmptyString).min(1),
});

const skillSchema = z.object({
  name: nonEmptyString,
  category: nonEmptyString,
  sort_order: z.number().int().min(0),
});

const experienceSchema = z.object({
  title: nonEmptyString,
  company: nonEmptyString,
  location: nonEmptyString,
  employment_type: nullableNonEmptyString,
  start_date: dateStringSchema,
  end_date: dateStringSchema.nullable(),
  is_current: z.boolean(),
  description: nullableNonEmptyString,
  sort_order: z.number().int().min(0),
  highlights: z.array(nonEmptyString),
  technologies: z.array(nonEmptyString),
});

const educationSchema = z.object({
  degree: nonEmptyString,
  field_of_study: nullableNonEmptyString,
  school: nonEmptyString,
  location: nullableNonEmptyString,
  start_date: dateStringSchema.nullable(),
  end_date: dateStringSchema.nullable(),
  description: nullableNonEmptyString,
  sort_order: z.number().int().min(0),
});

const certificationSchema = z.object({
  name: nonEmptyString,
  issuer: nullableNonEmptyString,
  issue_date: dateStringSchema.nullable(),
  expiry_date: dateStringSchema.nullable(),
  credential_id: nullableNonEmptyString,
  credential_url: nullableNonEmptyString,
  sort_order: z.number().int().min(0),
});

const sourceNotesSchema = z
  .object({
    source: z.string().trim().optional(),
    date_precision: z.string().trim().optional(),
    employment_type: z.string().trim().optional(),
    credential_dates: z.string().trim().optional(),
    profile: z.string().trim().optional(),
  })
  .passthrough();

export const resumeImportSchema = z.object({
  schema_version: z.literal(1),
  profile: resumeProfileSchema,
  skills: z.array(skillSchema),
  experiences: z.array(experienceSchema),
  education: z.array(educationSchema),
  certifications: z.array(certificationSchema),
  source_notes: sourceNotesSchema.optional(),
});

const backupSkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const backupExperienceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  employment_type: z.string().nullable(),
  start_date: z.string().regex(monthDateRegex),
  end_date: z.string().regex(monthDateRegex).nullable(),
  is_current: z.boolean(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const backupHighlightSchema = z.object({
  id: z.string().uuid(),
  experience_id: z.string().uuid(),
  highlight: z.string(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const backupTechnologySchema = z.object({
  id: z.string().uuid(),
  experience_id: z.string().uuid(),
  technology: z.string(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const backupEducationSchema = z.object({
  id: z.string().uuid(),
  degree: z.string(),
  field_of_study: z.string().nullable(),
  school: z.string(),
  location: z.string().nullable(),
  start_date: z.string().regex(monthDateRegex).nullable(),
  end_date: z.string().regex(monthDateRegex).nullable(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const backupCertificationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  issuer: z.string().nullable(),
  issue_date: z.string().regex(monthDateRegex).nullable(),
  expiry_date: z.string().regex(monthDateRegex).nullable(),
  credential_id: z.string().nullable(),
  credential_url: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const resumeBackupSchema = z.object({
  metadata: z.object({
    generated_at: z.string().datetime(),
    database: z.string(),
    schema: z.string(),
  }),
  skills: z.array(backupSkillSchema),
  experiences: z.array(backupExperienceSchema),
  experience_highlights: z.array(backupHighlightSchema),
  experience_technologies: z.array(backupTechnologySchema),
  education: z.array(backupEducationSchema),
  certifications: z.array(backupCertificationSchema),
});

export type ResumeImportInput = z.infer<typeof resumeImportSchema>;
export type ResumeBackup = z.infer<typeof resumeBackupSchema>;

interface ResumeTarget {
  database: string;
  schema: string;
}

interface ResumeImportRows {
  skills: Array<{
    id: string;
    name: string;
    category: string;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
  experiences: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    employment_type: string | null;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
  experience_highlights: Array<{
    id: string;
    experience_id: string;
    highlight: string;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
  experience_technologies: Array<{
    id: string;
    experience_id: string;
    technology: string;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
  education: Array<{
    id: string;
    degree: string;
    field_of_study: string | null;
    school: string;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    description: string | null;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    credential_id: string | null;
    credential_url: string | null;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
  }>;
}

export interface ResumeImportPreview {
  target: ResumeTarget;
  input_counts: {
    skills: number;
    experiences: number;
    experience_highlights: number;
    experience_technologies: number;
    education: number;
    certifications: number;
  };
  current_counts: {
    skills: number;
    experiences: number;
    experience_highlights: number;
    experience_technologies: number;
    education: number;
    certifications: number;
  };
}

function assertValidUuids(rows: ResumeImportRows): void {
  const values = [
    ...rows.skills.map((row) => row.id),
    ...rows.experiences.map((row) => row.id),
    ...rows.experience_highlights.map((row) => row.id),
    ...rows.experience_technologies.map((row) => row.id),
    ...rows.education.map((row) => row.id),
    ...rows.certifications.map((row) => row.id),
  ];

  if (values.some((value) => !validateUuid(value))) {
    throw new Error('Generated import rows include an invalid UUID');
  }
}

function buildImportRows(input: ResumeImportInput): ResumeImportRows {
  const now = new Date();
  const experiences = input.experiences.map((experience) => ({
    id: uuidv4(),
    title: experience.title,
    company: experience.company,
    location: experience.location,
    employment_type: experience.employment_type,
    start_date: experience.start_date,
    end_date: experience.end_date,
    is_current: experience.is_current,
    description: experience.description,
    sort_order: experience.sort_order,
    created_at: now,
    updated_at: now,
  }));

  const experienceIdByIndex = new Map<number, string>();
  experiences.forEach((experience, index) => {
    experienceIdByIndex.set(index, experience.id);
  });

  const experienceHighlights = input.experiences.flatMap((experience, experienceIndex) =>
    experience.highlights.map((highlight, highlightIndex) => ({
      id: uuidv4(),
      experience_id: experienceIdByIndex.get(experienceIndex) ?? '',
      highlight,
      sort_order: highlightIndex,
      created_at: now,
      updated_at: now,
    }))
  );

  const experienceTechnologies = input.experiences.flatMap((experience, experienceIndex) =>
    experience.technologies.map((technology, technologyIndex) => ({
      id: uuidv4(),
      experience_id: experienceIdByIndex.get(experienceIndex) ?? '',
      technology,
      sort_order: technologyIndex,
      created_at: now,
      updated_at: now,
    }))
  );

  const rows: ResumeImportRows = {
    skills: input.skills.map((skill) => ({
      id: uuidv4(),
      name: skill.name,
      category: skill.category,
      sort_order: skill.sort_order,
      created_at: now,
      updated_at: now,
    })),
    experiences,
    experience_highlights: experienceHighlights,
    experience_technologies: experienceTechnologies,
    education: input.education.map((education) => ({
      id: uuidv4(),
      degree: education.degree,
      field_of_study: education.field_of_study,
      school: education.school,
      location: education.location,
      start_date: education.start_date,
      end_date: education.end_date,
      description: education.description,
      sort_order: education.sort_order,
      created_at: now,
      updated_at: now,
    })),
    certifications: input.certifications.map((certification) => ({
      id: uuidv4(),
      name: certification.name,
      issuer: certification.issuer,
      issue_date: certification.issue_date,
      expiry_date: certification.expiry_date,
      credential_id: certification.credential_id,
      credential_url: certification.credential_url,
      sort_order: certification.sort_order,
      created_at: now,
      updated_at: now,
    })),
  };

  rows.experience_highlights.forEach((row) => {
    if (!row.experience_id || !validateUuid(row.experience_id)) {
      throw new Error('Experience highlight references an invalid experience_id');
    }
  });

  rows.experience_technologies.forEach((row) => {
    if (!row.experience_id || !validateUuid(row.experience_id)) {
      throw new Error('Experience technology references an invalid experience_id');
    }
  });

  assertValidUuids(rows);
  return rows;
}

async function getTarget(): Promise<ResumeTarget> {
  const db = getDb();
  const result = await db.raw<{ rows: Array<{ database: string; schema: string }> }>(
    'SELECT current_database() AS database, current_schema() AS schema'
  );

  const firstRow = result?.rows?.[0];
  return {
    database: firstRow?.database ?? 'unknown',
    schema: firstRow?.schema ?? 'public',
  };
}

async function getCurrentCounts() {
  const db = getDb();

  const [skills, experiences, highlights, technologies, education, certifications] =
    await Promise.all([
      db('skills').count<{ count: string }>('id as count').first(),
      db('experiences').count<{ count: string }>('id as count').first(),
      db('experience_highlights').count<{ count: string }>('id as count').first(),
      db('experience_technologies').count<{ count: string }>('id as count').first(),
      db('education').count<{ count: string }>('id as count').first(),
      db('certifications').count<{ count: string }>('id as count').first(),
    ]);

  return {
    skills: Number(skills?.count ?? 0),
    experiences: Number(experiences?.count ?? 0),
    experience_highlights: Number(highlights?.count ?? 0),
    experience_technologies: Number(technologies?.count ?? 0),
    education: Number(education?.count ?? 0),
    certifications: Number(certifications?.count ?? 0),
  };
}

function toIsoTimestamp(value: Date | string | null): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

function toDateOnly(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

async function readBackup(): Promise<ResumeBackup> {
  const db = getDb();
  const target = await getTarget();

  const [
    skills,
    experiences,
    experienceHighlights,
    experienceTechnologies,
    education,
    certifications,
  ] = await Promise.all([
    db('skills').select('*').orderBy('category').orderBy('sort_order').orderBy('name'),
    db('experiences').select('*').orderBy('is_current', 'desc').orderBy('start_date', 'desc'),
    db('experience_highlights').select('*').orderBy('experience_id').orderBy('sort_order'),
    db('experience_technologies').select('*').orderBy('experience_id').orderBy('sort_order'),
    db('education').select('*').orderBy('sort_order').orderBy('end_date', 'desc'),
    db('certifications').select('*').orderBy('sort_order').orderBy('issue_date', 'desc'),
  ]);

  return {
    metadata: {
      generated_at: new Date().toISOString(),
      database: target.database,
      schema: target.schema,
    },
    skills: skills.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
    experiences: experiences.map((row) => ({
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      employment_type: row.employment_type,
      start_date: toDateOnly(row.start_date) ?? '',
      end_date: toDateOnly(row.end_date),
      is_current: row.is_current,
      description: row.description,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
    experience_highlights: experienceHighlights.map((row) => ({
      id: row.id,
      experience_id: row.experience_id,
      highlight: row.highlight,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
    experience_technologies: experienceTechnologies.map((row) => ({
      id: row.id,
      experience_id: row.experience_id,
      technology: row.technology,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
    education: education.map((row) => ({
      id: row.id,
      degree: row.degree,
      field_of_study: row.field_of_study,
      school: row.school,
      location: row.location,
      start_date: toDateOnly(row.start_date),
      end_date: toDateOnly(row.end_date),
      description: row.description,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
    certifications: certifications.map((row) => ({
      id: row.id,
      name: row.name,
      issuer: row.issuer,
      issue_date: toDateOnly(row.issue_date),
      expiry_date: toDateOnly(row.expiry_date),
      credential_id: row.credential_id,
      credential_url: row.credential_url,
      sort_order: row.sort_order,
      created_at: toIsoTimestamp(row.created_at),
      updated_at: toIsoTimestamp(row.updated_at),
    })),
  };
}

async function replaceResumeRows(rows: ResumeImportRows): Promise<void> {
  const db = getDb();

  await db.transaction(async (trx) => {
    await trx('experience_highlights').delete();
    await trx('experience_technologies').delete();
    await trx('experiences').delete();
    await trx('skills').delete();
    await trx('education').delete();
    await trx('certifications').delete();

    if (rows.skills.length > 0) {
      await trx('skills').insert(rows.skills);
    }

    if (rows.experiences.length > 0) {
      await trx('experiences').insert(rows.experiences);
    }

    if (rows.experience_highlights.length > 0) {
      await trx('experience_highlights').insert(rows.experience_highlights);
    }

    if (rows.experience_technologies.length > 0) {
      await trx('experience_technologies').insert(rows.experience_technologies);
    }

    if (rows.education.length > 0) {
      await trx('education').insert(rows.education);
    }

    if (rows.certifications.length > 0) {
      await trx('certifications').insert(rows.certifications);
    }
  });
}

function parseBackupDates(backup: ResumeBackup): ResumeImportRows {
  return {
    skills: backup.skills.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
    experiences: backup.experiences.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
    experience_highlights: backup.experience_highlights.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
    experience_technologies: backup.experience_technologies.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
    education: backup.education.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
    certifications: backup.certifications.map((row) => ({
      ...row,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    })),
  };
}

export function validateResumeImportInput(input: unknown): ResumeImportInput {
  return resumeImportSchema.parse(input);
}

export function validateResumeBackup(input: unknown): ResumeBackup {
  return resumeBackupSchema.parse(input);
}

export async function getResumeImportPreview(
  input: ResumeImportInput
): Promise<ResumeImportPreview> {
  const rows = buildImportRows(input);
  const [target, currentCounts] = await Promise.all([getTarget(), getCurrentCounts()]);

  return {
    target,
    input_counts: {
      skills: rows.skills.length,
      experiences: rows.experiences.length,
      experience_highlights: rows.experience_highlights.length,
      experience_technologies: rows.experience_technologies.length,
      education: rows.education.length,
      certifications: rows.certifications.length,
    },
    current_counts: currentCounts,
  };
}

export async function replaceResumeFromImport(input: ResumeImportInput): Promise<{
  preview: ResumeImportPreview;
  backup: ResumeBackup;
}> {
  const rows = buildImportRows(input);
  const [preview, backup] = await Promise.all([getResumeImportPreview(input), readBackup()]);
  await replaceResumeRows(rows);
  return {
    preview,
    backup,
  };
}

export async function restoreResumeFromBackup(backupInput: unknown): Promise<{
  preview: ResumeImportPreview;
}> {
  const backup = validateResumeBackup(backupInput);
  const rows = parseBackupDates(backup);
  assertValidUuids(rows);

  const preview = {
    target: await getTarget(),
    input_counts: {
      skills: rows.skills.length,
      experiences: rows.experiences.length,
      experience_highlights: rows.experience_highlights.length,
      experience_technologies: rows.experience_technologies.length,
      education: rows.education.length,
      certifications: rows.certifications.length,
    },
    current_counts: await getCurrentCounts(),
  };

  await replaceResumeRows(rows);

  return { preview };
}
