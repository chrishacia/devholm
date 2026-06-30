import { NextResponse } from 'next/server';

/**
 * Resume API Route
 *
 * Returns resume data from the database, with static example fallback.
 * CUSTOMIZE: Replace the staticResume data with your own information,
 * or better yet, use the database seeds to populate your resume.
 */

// Example static resume data (used when database isn't available)
const staticResume = {
  skills: {
    frontend: [
      { id: '1', name: 'React', category: 'frontend' },
      { id: '2', name: 'TypeScript', category: 'frontend' },
      { id: '3', name: 'Next.js', category: 'frontend' },
      { id: '4', name: 'HTML5', category: 'frontend' },
      { id: '5', name: 'CSS3', category: 'frontend' },
      { id: '6', name: 'Tailwind CSS', category: 'frontend' },
      { id: '7', name: 'Material UI', category: 'frontend' },
    ],
    backend: [
      { id: '8', name: 'Node.js', category: 'backend' },
      { id: '9', name: 'Express', category: 'backend' },
      { id: '10', name: 'Python', category: 'backend' },
      { id: '11', name: 'GraphQL', category: 'backend' },
      { id: '12', name: 'REST APIs', category: 'backend' },
    ],
    testing: [
      { id: '13', name: 'Jest', category: 'testing' },
      { id: '14', name: 'Vitest', category: 'testing' },
      { id: '15', name: 'Playwright', category: 'testing' },
      { id: '16', name: 'Cypress', category: 'testing' },
    ],
    devops: [
      { id: '17', name: 'Docker', category: 'devops' },
      { id: '18', name: 'GitHub Actions', category: 'devops' },
      { id: '19', name: 'CI/CD', category: 'devops' },
    ],
    cloud: [
      { id: '20', name: 'AWS', category: 'cloud' },
      { id: '21', name: 'Vercel', category: 'cloud' },
      { id: '22', name: 'Railway', category: 'cloud' },
    ],
    databases: [
      { id: '23', name: 'PostgreSQL', category: 'databases' },
      { id: '24', name: 'MongoDB', category: 'databases' },
      { id: '25', name: 'Redis', category: 'databases' },
    ],
    tools: [
      { id: '26', name: 'Git', category: 'tools' },
      { id: '27', name: 'VS Code', category: 'tools' },
      { id: '28', name: 'Figma', category: 'tools' },
    ],
  },
  experiences: [
    {
      id: '1',
      title: 'Senior Software Engineer',
      company: 'Acme Tech Corp',
      location: 'Remote',
      employment_type: 'full-time',
      start_date: '2022-01-01',
      end_date: null,
      is_current: true,
      highlights: [
        'Led development of customer-facing React application serving 50k+ daily users.',
        'Architected microservices backend using Node.js and PostgreSQL.',
        'Mentored junior developers and established code review best practices.',
        'Reduced page load times by 40% through performance optimization.',
      ],
      technologies: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
    },
    {
      id: '2',
      title: 'Full Stack Developer',
      company: 'StartupXYZ',
      location: 'San Francisco, CA',
      employment_type: 'full-time',
      start_date: '2019-06-01',
      end_date: '2021-12-31',
      is_current: false,
      highlights: [
        'Built MVP from scratch that helped secure Series A funding.',
        'Implemented real-time features using WebSockets and Redis.',
        'Designed and maintained CI/CD pipelines with GitHub Actions.',
        'Collaborated with design team to create accessible UI components.',
      ],
      technologies: ['Vue.js', 'Python', 'Django', 'Redis', 'GitHub Actions'],
    },
    {
      id: '3',
      title: 'Junior Developer',
      company: 'Digital Agency Co',
      location: 'New York, NY',
      employment_type: 'full-time',
      start_date: '2017-08-01',
      end_date: '2019-05-31',
      is_current: false,
      highlights: [
        'Developed responsive websites for diverse client portfolio.',
        'Learned agile methodologies and participated in sprint planning.',
        'Created automated testing suite reducing QA time by 30%.',
      ],
      technologies: ['JavaScript', 'HTML', 'CSS', 'PHP', 'MySQL'],
    },
  ],
  education: [
    {
      id: '1',
      institution: 'State University',
      degree: 'Bachelor of Science',
      field_of_study: 'Computer Science',
      start_date: '2013-09-01',
      end_date: '2017-05-31',
      description: 'Graduated with honors. Focus on software engineering and distributed systems.',
    },
  ],
  certifications: [
    {
      id: '1',
      name: 'AWS Certified Developer',
      issuer: 'Amazon Web Services',
      issue_date: '2023-01-15',
      expiry_date: '2026-01-15',
      credential_url: 'https://aws.amazon.com/certification/',
    },
  ],
};

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

      // Check if tables exist
      const skillsExist = await db.schema.hasTable('skills');
      const experiencesExist = await db.schema.hasTable('experiences');

      if (skillsExist && experiencesExist) {
        // Fetch skills grouped by category
        const skillsRaw = await db('skills').orderBy(['category', 'sort_order']);
        const skills: Record<string, typeof skillsRaw> = {};
        for (const skill of skillsRaw) {
          if (!skills[skill.category]) {
            skills[skill.category] = [];
          }
          skills[skill.category].push(skill);
        }

        // Fetch experiences with highlights and technologies
        const experiencesRaw = await db('experiences').orderBy('start_date', 'desc');
        const experiences = await Promise.all(
          experiencesRaw.map(async (exp) => {
            const highlights = await db('experience_highlights')
              .where('experience_id', exp.id)
              .orderBy('sort_order');
            const technologies = await db('experience_technologies')
              .where('experience_id', exp.id)
              .orderBy('sort_order');
            return {
              ...exp,
              highlights: highlights.map((h) => h.highlight),
              technologies: technologies.map((t) => t.technology),
            };
          })
        );

        // Fetch education
        const education = await db('education').orderBy('start_date', 'desc');

        // Fetch certifications
        const certifications = await db('certifications').orderBy('issue_date', 'desc');

        // If we have data, return it
        if (Object.keys(skills).length > 0 || experiences.length > 0) {
          return NextResponse.json({
            skills,
            experiences,
            education,
            certifications,
          });
        }
      }
    } catch (error) {
      console.error('Resume API: Database error, using static data:', error);
    }
  }

  // Return static data as fallback
  return NextResponse.json(staticResume);
}
