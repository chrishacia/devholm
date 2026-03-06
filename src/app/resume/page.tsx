import type { Metadata } from 'next';
import ResumePageClient from './ResumePageClient';
import { siteConfig } from '@/config';
import { getFullResume } from '@/db/resume';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resume',
  description:
    'Professional resume - Full Stack Developer with experience in React, Next.js, TypeScript, Node.js, and more.',
  openGraph: {
    title: `Resume | ${siteConfig.name}`,
    description: 'Professional resume and work experience.',
    url: `${siteConfig.url}/resume`,
  },
  twitter: {
    card: 'summary_large_image',
    title: `Resume | ${siteConfig.name}`,
    description: 'Professional resume and work experience.',
  },
  alternates: {
    canonical: `${siteConfig.url}/resume`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function ResumePage() {
  const resume = await getFullResume();

  // Serialize dates for client component
  const serializedResume = {
    ...resume,
    experiences: resume.experiences.map((exp) => ({
      ...exp,
      start_date: exp.start_date.toISOString(),
      end_date: exp.end_date ? exp.end_date.toISOString() : null,
    })),
    education: resume.education.map((edu) => ({
      ...edu,
      start_date: edu.start_date ? edu.start_date.toISOString() : null,
      end_date: edu.end_date ? edu.end_date.toISOString() : null,
    })),
  };

  return <ResumePageClient resume={serializedResume} />;
}
