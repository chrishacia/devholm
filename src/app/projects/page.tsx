import type { Metadata } from 'next';
import ProjectsPageClient from './ProjectsPageClient';
import { siteConfig } from '@/config';
import { getAllProjects } from '@/db/projects';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Projects',
  description:
    "Explore my portfolio of web development projects. From full-stack applications to open-source contributions, see what I've been building.",
  openGraph: {
    title: `Projects | ${siteConfig.name}`,
    description: 'Explore my portfolio of web development projects and open-source contributions.',
    url: `${siteConfig.url}/projects`,
  },
  twitter: {
    card: 'summary_large_image',
    title: `Projects | ${siteConfig.name}`,
    description: 'Explore my portfolio of web development projects.',
  },
  alternates: {
    canonical: `${siteConfig.url}/projects`,
  },
};

export default async function ProjectsPage() {
  const projects = await getAllProjects();

  return <ProjectsPageClient projects={projects} />;
}
