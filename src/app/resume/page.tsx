import type { Metadata } from 'next';
import ResumeView from '@core/views/resume/ResumeView';
import { getFullResume } from '@/db/resume';
import { fetchSiteSettings } from '@/lib/fetchSiteSettings';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';
import { readdir } from 'fs/promises';
import path from 'path';

async function getResumeFileInfo(): Promise<{ url: string; filename: string } | null> {
  const resumeDir = path.join(process.cwd(), 'public', 'uploads', 'resume');
  try {
    const files = await readdir(resumeDir);
    const resumeFile = files.find((f) => f.startsWith('resume.'));
    if (resumeFile) return { url: `/uploads/resume/${resumeFile}`, filename: resumeFile };
  } catch {
    /* directory doesn't exist */
  }
  return null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Resume',
    description:
      'Professional resume - Full Stack Developer with experience in React, Next.js, TypeScript, Node.js, and more.',
    path: '/resume',
    robots: {
      index: true,
      follow: true,
    },
  });
}

export default async function ResumePage() {
  const [resumeData, settings, resumeFile] = await Promise.all([
    getFullResume().catch(() => ({
      skills: {} as Record<string, never>,
      experiences: [],
      education: [],
      certifications: [],
    })),
    fetchSiteSettings(),
    getResumeFileInfo().catch(() => null),
  ]);

  // Serialize Date objects to strings for the client component
  const serializedResume = {
    skills: resumeData.skills,
    experiences: resumeData.experiences.map((exp) => ({
      ...exp,
      start_date: exp.start_date.toISOString(),
      end_date: exp.end_date ? exp.end_date.toISOString() : null,
    })),
    education: resumeData.education.map((edu) => ({
      ...edu,
      start_date: edu.start_date ? edu.start_date.toISOString() : null,
      end_date: edu.end_date ? edu.end_date.toISOString() : null,
    })),
    certifications: resumeData.certifications,
    resumeFile,
  };

  return (
    <>
      <SeoExtensionJsonLd path="/resume" />
      <ResumeView resume={serializedResume} settings={settings} />
    </>
  );
}
