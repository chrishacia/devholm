import { NextResponse } from 'next/server';

/**
 * Projects API Route
 *
 * Returns projects data from the database, with static example fallback.
 * CUSTOMIZE: Replace the staticProjects data with your own projects,
 * or better yet, use the database seeds to populate your portfolio.
 */

// Example static projects data (used when database isn't available)
const staticProjects = [
  {
    id: '1',
    title: 'Personal Portfolio',
    slug: 'personal-portfolio',
    description:
      'My personal website built with Next.js, featuring a blog, projects showcase, and contact form. Fully responsive with dark mode support.',
    image_url: '/images/projects/portfolio.png',
    github_url: 'https://github.com/yourusername/portfolio',
    live_url: 'https://yoursite.com',
    is_featured: true,
    technologies: ['Next.js', 'React', 'TypeScript', 'PostgreSQL', 'Tailwind CSS'],
  },
  {
    id: '2',
    title: 'Task Manager App',
    slug: 'task-manager',
    description:
      'A full-stack task management application with real-time updates, team collaboration features, and calendar integration.',
    image_url: '/images/projects/task-manager.png',
    github_url: 'https://github.com/yourusername/task-manager',
    live_url: 'https://tasks.yoursite.com',
    is_featured: true,
    technologies: ['React', 'Node.js', 'Socket.io', 'MongoDB', 'Docker'],
  },
  {
    id: '3',
    title: 'Weather Dashboard',
    slug: 'weather-dashboard',
    description:
      'A beautiful weather dashboard that displays forecasts, historical data, and weather alerts using multiple weather APIs.',
    image_url: '/images/projects/weather.png',
    github_url: 'https://github.com/yourusername/weather-app',
    live_url: 'https://weather.yoursite.com',
    is_featured: false,
    technologies: ['Vue.js', 'Chart.js', 'OpenWeather API'],
  },
  {
    id: '4',
    title: 'E-commerce API',
    slug: 'ecommerce-api',
    description:
      'A RESTful API for e-commerce applications with authentication, product management, cart functionality, and payment integration.',
    image_url: '/images/projects/api.png',
    github_url: 'https://github.com/yourusername/ecommerce-api',
    live_url: null,
    is_featured: true,
    technologies: ['Node.js', 'Express', 'PostgreSQL', 'Stripe', 'JWT'],
  },
  {
    id: '5',
    title: 'CLI Tool Suite',
    slug: 'cli-tools',
    description:
      'A collection of command-line tools for developer productivity, including file utilities, git helpers, and project scaffolding.',
    image_url: '/images/projects/cli.png',
    github_url: 'https://github.com/yourusername/cli-tools',
    live_url: null,
    is_featured: false,
    technologies: ['TypeScript', 'Node.js', 'Commander.js'],
  },
];

// Dynamic import for database module
async function getDbModule() {
  try {
    const dbModule = await import('@/db');
    return dbModule.getDb;
  } catch {
    return null;
  }
}

export async function GET() {
  // Try to get data from database first
  const getDb = await getDbModule();
  if (getDb) {
    try {
      const db = getDb();

      // Check if table exists
      const tableExists = await db.schema.hasTable('projects');

      if (tableExists) {
        // Fetch projects with technologies
        const projectsRaw = await db('projects')
          .where('is_private', false)
          .orderBy([
            { column: 'is_featured', order: 'desc' },
            { column: 'sort_order', order: 'asc' },
          ]);

        if (projectsRaw.length > 0) {
          const projects = await Promise.all(
            projectsRaw.map(async (project) => {
              const technologies = await db('project_technologies')
                .where('project_id', project.id)
                .orderBy('sort_order');
              return {
                ...project,
                technologies: technologies.map((t) => t.technology),
              };
            })
          );

          return NextResponse.json(projects);
        }
      }
    } catch (error) {
      console.error('Projects API: Database error, using static data:', error);
    }
  }

  // Return static data as fallback
  return NextResponse.json(staticProjects);
}
