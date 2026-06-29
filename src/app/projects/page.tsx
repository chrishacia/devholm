import type { Metadata } from 'next';
import ProjectsView from '@core/views/projects/ProjectsView';
import { getAllProjects } from '@/db/projects';
import SeoExtensionJsonLd from '@/components/seo/SeoExtensionJsonLd';
import { buildExtendedPageMetadata, getSeoSiteSettings } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSiteSettings();
  return buildExtendedPageMetadata(settings, {
    title: 'Projects',
    description:
      "Explore my portfolio of web development projects. From full-stack applications to open-source contributions, see what I've been building.",
    path: '/projects',
  });
}

export default async function ProjectsPage() {
  const projects = await getAllProjects().catch(() => []);

  return (
    <>
      <SeoExtensionJsonLd path="/projects" />
      <ProjectsView projects={projects} />
    </>
  );
}
