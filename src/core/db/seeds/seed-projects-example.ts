import { getDb, closeDb } from '../index';

/**
 * Seeds the projects table with example/placeholder data.
 *
 * CUSTOMIZE THIS FILE with your own projects!
 * This is demo data to show the structure - replace with your own information.
 */
export async function seedProjects(): Promise<void> {
  console.log('Seeding example projects data...');

  const db = getDb();

  // Clear existing data
  await db('project_technologies').delete();
  await db('projects').delete();

  const projects = [
    {
      title: 'Personal Portfolio',
      slug: 'personal-portfolio',
      description:
        'My personal website built with Next.js, featuring a blog, projects showcase, and contact form. Fully responsive with dark mode support.',
      image_url: '/images/projects/portfolio.png',
      github_url: 'https://github.com/yourusername/portfolio',
      live_url: 'https://yoursite.com',
      is_featured: true,
      is_private: false,
      sort_order: 0,
      technologies: ['Next.js', 'React', 'TypeScript', 'PostgreSQL', 'Tailwind CSS'],
    },
    {
      title: 'Task Manager App',
      slug: 'task-manager',
      description:
        'A full-stack task management application with real-time updates, team collaboration features, and calendar integration.',
      image_url: '/images/projects/task-manager.png',
      github_url: 'https://github.com/yourusername/task-manager',
      live_url: 'https://tasks.yoursite.com',
      is_featured: true,
      is_private: false,
      sort_order: 1,
      technologies: ['React', 'Node.js', 'Socket.io', 'MongoDB', 'Docker'],
    },
    {
      title: 'Weather Dashboard',
      slug: 'weather-dashboard',
      description:
        'A beautiful weather dashboard that displays forecasts, historical data, and weather alerts using multiple weather APIs.',
      image_url: '/images/projects/weather.png',
      github_url: 'https://github.com/yourusername/weather-app',
      live_url: 'https://weather.yoursite.com',
      is_featured: false,
      is_private: false,
      sort_order: 2,
      technologies: ['Vue.js', 'Chart.js', 'OpenWeather API'],
    },
    {
      title: 'E-commerce API',
      slug: 'ecommerce-api',
      description:
        'A RESTful API for e-commerce applications with authentication, product management, cart functionality, and payment integration.',
      image_url: '/images/projects/api.png',
      github_url: 'https://github.com/yourusername/ecommerce-api',
      live_url: null,
      is_featured: true,
      is_private: false,
      sort_order: 3,
      technologies: ['Node.js', 'Express', 'PostgreSQL', 'Stripe', 'JWT'],
    },
    {
      title: 'CLI Tool Suite',
      slug: 'cli-tools',
      description:
        'A collection of command-line tools for developer productivity, including file utilities, git helpers, and project scaffolding.',
      image_url: '/images/projects/cli.png',
      github_url: 'https://github.com/yourusername/cli-tools',
      live_url: null,
      is_featured: false,
      is_private: false,
      sort_order: 4,
      technologies: ['TypeScript', 'Node.js', 'Commander.js'],
    },
    {
      title: 'Internal Dashboard',
      slug: 'internal-dashboard',
      description:
        'An internal analytics dashboard for tracking key business metrics. Built for a private client.',
      image_url: '/images/projects/dashboard.png',
      github_url: null,
      live_url: null,
      is_featured: false,
      is_private: true,
      sort_order: 5,
      technologies: ['React', 'D3.js', 'Python', 'FastAPI'],
    },
  ];

  for (const project of projects) {
    const { technologies, ...projectData } = project;

    const [inserted] = await db('projects').insert(projectData).returning('id');

    const projectId = inserted.id;

    // Add technologies
    for (let i = 0; i < technologies.length; i++) {
      await db('project_technologies').insert({
        project_id: projectId,
        technology: technologies[i],
        sort_order: i,
      });
    }
  }

  console.log('✓ Example projects seeded successfully!');
  console.log('  💡 Customize this file with your own projects.');
}

// Allow running directly: npx ts-node src/db/seeds/seed-projects-example.ts
if (require.main === module) {
  seedProjects()
    .then(() => closeDb())
    .catch((err) => {
      console.error('Seed failed:', err);
      closeDb();
      process.exit(1);
    });
}
