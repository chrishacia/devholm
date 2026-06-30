import { getDb } from './index';

// Types
export interface Skill {
  id: string;
  name: string;
  category: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  start_date: Date;
  end_date: Date | null;
  is_current: boolean;
  description: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ExperienceHighlight {
  id: string;
  experience_id: string;
  highlight: string;
  sort_order: number;
}

export interface ExperienceTechnology {
  id: string;
  experience_id: string;
  technology: string;
  sort_order: number;
}

export interface ExperienceWithDetails extends Experience {
  highlights: string[];
  technologies: string[];
}

export interface Education {
  id: string;
  degree: string;
  field_of_study: string | null;
  school: string;
  location: string | null;
  start_date: Date | null;
  end_date: Date | null;
  description: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string | null;
  issue_date: Date | null;
  expiry_date: Date | null;
  credential_id: string | null;
  credential_url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

// Skills
export async function getAllSkills(): Promise<Skill[]> {
  return getDb()('skills').orderBy('category').orderBy('sort_order').orderBy('name');
}

export async function getSkillsByCategory(category: string): Promise<Skill[]> {
  return getDb()('skills').where({ category }).orderBy('sort_order').orderBy('name');
}

export async function getSkillsGroupedByCategory(): Promise<Record<string, Skill[]>> {
  const skills = await getAllSkills();
  return skills.reduce(
    (acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = [];
      }
      acc[skill.category].push(skill);
      return acc;
    },
    {} as Record<string, Skill[]>
  );
}

export async function createSkill(
  data: Omit<Skill, 'id' | 'created_at' | 'updated_at'>
): Promise<Skill> {
  const [skill] = await getDb()('skills').insert(data).returning('*');
  return skill;
}

export async function updateSkill(id: string, data: Partial<Skill>): Promise<Skill | null> {
  const [skill] = await getDb()('skills')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return skill || null;
}

export async function deleteSkill(id: string): Promise<boolean> {
  const deleted = await getDb()('skills').where({ id }).delete();
  return deleted > 0;
}

// Experiences
export async function getAllExperiences(): Promise<ExperienceWithDetails[]> {
  const experiences = await getDb()('experiences')
    .orderBy('is_current', 'desc')
    .orderBy('start_date', 'desc');

  return Promise.all(
    experiences.map(async (exp) => {
      const highlights = await getDb()('experience_highlights')
        .where({ experience_id: exp.id })
        .orderBy('sort_order');

      const technologies = await getDb()('experience_technologies')
        .where({ experience_id: exp.id })
        .orderBy('sort_order');

      return {
        ...exp,
        highlights: highlights.map((h) => h.highlight),
        technologies: technologies.map((t) => t.technology),
      };
    })
  );
}

export async function getExperienceById(id: string): Promise<ExperienceWithDetails | null> {
  const experience = await getDb()('experiences').where({ id }).first();
  if (!experience) return null;

  const highlights = await getDb()('experience_highlights')
    .where({ experience_id: id })
    .orderBy('sort_order');

  const technologies = await getDb()('experience_technologies')
    .where({ experience_id: id })
    .orderBy('sort_order');

  return {
    ...experience,
    highlights: highlights.map((h) => h.highlight),
    technologies: technologies.map((t) => t.technology),
  };
}

export async function getCurrentExperience(): Promise<ExperienceWithDetails | null> {
  const experience = await getDb()('experiences').where({ is_current: true }).first();
  if (!experience) return null;
  return getExperienceById(experience.id);
}

export async function createExperience(
  data: Omit<Experience, 'id' | 'created_at' | 'updated_at'>,
  highlights: string[] = [],
  technologies: string[] = []
): Promise<ExperienceWithDetails> {
  const [experience] = await getDb()('experiences').insert(data).returning('*');

  if (highlights.length > 0) {
    await getDb()('experience_highlights').insert(
      highlights.map((highlight, index) => ({
        experience_id: experience.id,
        highlight,
        sort_order: index,
      }))
    );
  }

  if (technologies.length > 0) {
    await getDb()('experience_technologies').insert(
      technologies.map((technology, index) => ({
        experience_id: experience.id,
        technology,
        sort_order: index,
      }))
    );
  }

  return {
    ...experience,
    highlights,
    technologies,
  };
}

export async function updateExperience(
  id: string,
  data: Partial<Experience>,
  highlights?: string[],
  technologies?: string[]
): Promise<ExperienceWithDetails | null> {
  const [experience] = await getDb()('experiences')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');

  if (!experience) return null;

  if (highlights !== undefined) {
    await getDb()('experience_highlights').where({ experience_id: id }).delete();
    if (highlights.length > 0) {
      await getDb()('experience_highlights').insert(
        highlights.map((highlight, index) => ({
          experience_id: id,
          highlight,
          sort_order: index,
        }))
      );
    }
  }

  if (technologies !== undefined) {
    await getDb()('experience_technologies').where({ experience_id: id }).delete();
    if (technologies.length > 0) {
      await getDb()('experience_technologies').insert(
        technologies.map((technology, index) => ({
          experience_id: id,
          technology,
          sort_order: index,
        }))
      );
    }
  }

  return getExperienceById(id);
}

export async function deleteExperience(id: string): Promise<boolean> {
  const deleted = await getDb()('experiences').where({ id }).delete();
  return deleted > 0;
}

// Education
export async function getAllEducation(): Promise<Education[]> {
  return getDb()('education').orderBy('end_date', 'desc').orderBy('sort_order');
}

export async function getEducationById(id: string): Promise<Education | null> {
  return getDb()('education').where({ id }).first() || null;
}

export async function createEducation(
  data: Omit<Education, 'id' | 'created_at' | 'updated_at'>
): Promise<Education> {
  const [education] = await getDb()('education').insert(data).returning('*');
  return education;
}

export async function updateEducation(
  id: string,
  data: Partial<Education>
): Promise<Education | null> {
  const [education] = await getDb()('education')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return education || null;
}

export async function deleteEducation(id: string): Promise<boolean> {
  const deleted = await getDb()('education').where({ id }).delete();
  return deleted > 0;
}

// Certifications
export async function getAllCertifications(): Promise<Certification[]> {
  return getDb()('certifications').orderBy('issue_date', 'desc').orderBy('sort_order');
}

export async function getCertificationById(id: string): Promise<Certification | null> {
  return getDb()('certifications').where({ id }).first() || null;
}

export async function createCertification(
  data: Omit<Certification, 'id' | 'created_at' | 'updated_at'>
): Promise<Certification> {
  const [certification] = await getDb()('certifications').insert(data).returning('*');
  return certification;
}

export async function updateCertification(
  id: string,
  data: Partial<Certification>
): Promise<Certification | null> {
  const [certification] = await getDb()('certifications')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return certification || null;
}

export async function deleteCertification(id: string): Promise<boolean> {
  const deleted = await getDb()('certifications').where({ id }).delete();
  return deleted > 0;
}

// Full resume data
export interface FullResume {
  skills: Record<string, Skill[]>;
  experiences: ExperienceWithDetails[];
  education: Education[];
  certifications: Certification[];
}

export async function getFullResume(): Promise<FullResume> {
  const [skills, experiences, education, certifications] = await Promise.all([
    getSkillsGroupedByCategory(),
    getAllExperiences(),
    getAllEducation(),
    getAllCertifications(),
  ]);

  return { skills, experiences, education, certifications };
}
