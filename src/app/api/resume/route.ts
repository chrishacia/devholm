import { NextResponse } from 'next/server';
import { getFullResume } from '@/db/resume';
import { resumeProfile } from '@user/extensions/resume/profile';
import { readdir } from 'fs/promises';
import path from 'path';

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRequiredIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getResumeFileInfo(): Promise<{ url: string; filename: string } | null> {
  const resumeDir = path.join(process.cwd(), 'public', 'uploads', 'resume');
  try {
    const files = await readdir(resumeDir);
    const resumeFile = files.find((file) => file.startsWith('resume.'));
    if (resumeFile) {
      return {
        url: `/uploads/resume/${resumeFile}`,
        filename: resumeFile,
      };
    }
  } catch {
    // no uploaded resume file
  }
  return null;
}

export async function GET() {
  try {
    const [resumeData, resumeFile] = await Promise.all([getFullResume(), getResumeFileInfo()]);

    return NextResponse.json({
      profile: {
        headline: resumeProfile.headline,
        summary: resumeProfile.summary,
        category_order: resumeProfile.categoryOrder,
      },
      skills: resumeData.skills ?? {},
      experiences: (resumeData.experiences ?? []).map((experience) => ({
        ...experience,
        start_date: toRequiredIsoString(experience.start_date),
        end_date: toIsoString(experience.end_date),
      })),
      education: (resumeData.education ?? []).map((item) => ({
        ...item,
        start_date: toIsoString(item.start_date),
        end_date: toIsoString(item.end_date),
      })),
      certifications: resumeData.certifications ?? [],
      resumeFile,
    });
  } catch (error) {
    console.error('Resume API: failed to load resume data', error);
    return NextResponse.json(
      {
        profile: {
          headline: resumeProfile.headline,
          summary: resumeProfile.summary,
          category_order: resumeProfile.categoryOrder,
        },
        skills: {},
        experiences: [],
        education: [],
        certifications: [],
        resumeFile: null,
      },
      { status: 500 }
    );
  }
}
