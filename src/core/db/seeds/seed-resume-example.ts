import { getDb, closeDb } from '../index';

/**
 * Seeds the resume tables with example/placeholder data.
 *
 * CUSTOMIZE THIS FILE with your own resume data!
 * This is demo data to show the structure - replace with your own information.
 */
export async function seedResume(): Promise<void> {
  console.log('Seeding example resume data...');

  const db = getDb();

  // Clear existing data
  await db('experience_technologies').delete();
  await db('experience_highlights').delete();
  await db('experiences').delete();
  await db('skills').delete();
  await db('education').delete();
  await db('certifications').delete();

  // ============================================
  // SKILLS - Organized by category
  // ============================================
  const skillCategories = {
    frontend: [
      'React',
      'TypeScript',
      'Next.js',
      'Vue.js',
      'HTML5',
      'CSS3',
      'Tailwind CSS',
      'Material UI',
    ],
    backend: ['Node.js', 'Express', 'Python', 'Django', 'GraphQL', 'REST APIs', 'OAuth', 'JWT'],
    testing: ['Jest', 'Vitest', 'Playwright', 'Cypress'],
    devops: ['Docker', 'GitHub Actions', 'CI/CD', 'Terraform'],
    cloud: ['AWS', 'Vercel', 'Railway', 'Netlify'],
    databases: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis'],
    tools: ['Git', 'GitHub', 'VS Code', 'Figma', 'Jira', 'Notion'],
  };

  for (const [category, skills] of Object.entries(skillCategories)) {
    for (let i = 0; i < skills.length; i++) {
      await db('skills').insert({
        name: skills[i],
        category,
        sort_order: i,
      });
    }
  }
  console.log('  ✓ Skills seeded');

  // ============================================
  // EXPERIENCES - Example work history
  // ============================================
  const experiences = [
    {
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
  ];

  for (const exp of experiences) {
    const { highlights, technologies, ...experienceData } = exp;

    const [inserted] = await db('experiences').insert(experienceData).returning('id');

    const experienceId = inserted.id;

    // Add highlights
    for (let i = 0; i < highlights.length; i++) {
      await db('experience_highlights').insert({
        experience_id: experienceId,
        highlight: highlights[i],
        sort_order: i,
      });
    }

    // Add technologies
    for (let i = 0; i < technologies.length; i++) {
      await db('experience_technologies').insert({
        experience_id: experienceId,
        technology: technologies[i],
        sort_order: i,
      });
    }
  }
  console.log('  ✓ Experiences seeded');

  // ============================================
  // EDUCATION
  // ============================================
  await db('education').insert([
    {
      institution: 'State University',
      degree: 'Bachelor of Science',
      field_of_study: 'Computer Science',
      start_date: '2013-09-01',
      end_date: '2017-05-31',
      description: 'Graduated with honors. Focus on software engineering and distributed systems.',
      sort_order: 0,
    },
  ]);
  console.log('  ✓ Education seeded');

  // ============================================
  // CERTIFICATIONS
  // ============================================
  await db('certifications').insert([
    {
      name: 'AWS Certified Developer',
      issuer: 'Amazon Web Services',
      issue_date: '2023-01-15',
      expiry_date: '2026-01-15',
      credential_url: 'https://aws.amazon.com/certification/',
      sort_order: 0,
    },
  ]);
  console.log('  ✓ Certifications seeded');

  console.log('✓ Example resume data seeded successfully!');
  console.log('  💡 Customize this file with your own resume information.');
}

// Allow running directly: npx ts-node src/db/seeds/seed-resume-example.ts
if (require.main === module) {
  seedResume()
    .then(() => closeDb())
    .catch((err) => {
      console.error('Seed failed:', err);
      closeDb();
      process.exit(1);
    });
}
