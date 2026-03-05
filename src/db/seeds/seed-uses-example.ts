import { getDb, closeDb } from '../index';

/**
 * Seeds the uses tables with example/placeholder data.
 *
 * CUSTOMIZE THIS FILE with your own tools and equipment!
 * This is demo data to show the structure - replace with your own information.
 */
export async function seedUses(): Promise<void> {
  console.log('Seeding example uses data...');

  const db = getDb();

  // Clear existing data (items first due to foreign key)
  await db('uses_items').delete();
  await db('uses_categories').delete();

  // Helper to get inserted category ID
  const insertCategory = async (
    title: string,
    icon: string,
    sort_order: number
  ): Promise<string> => {
    const [category] = await db('uses_categories')
      .insert({ title, icon, sort_order })
      .returning('id');
    return category.id;
  };

  // Hardware category
  const hardwareId = await insertCategory('Hardware', 'Computer', 0);
  await db('uses_items').insert([
    {
      category_id: hardwareId,
      name: 'MacBook Pro 16"',
      description: 'Apple M2 Pro chip with 32GB RAM - handles everything I throw at it',
      url: 'https://www.apple.com/macbook-pro/',
      sort_order: 0,
    },
    {
      category_id: hardwareId,
      name: 'Dell UltraSharp 27" 4K Monitor',
      description: 'USB-C connectivity with excellent color accuracy',
      url: 'https://www.dell.com/monitors',
      sort_order: 1,
    },
    {
      category_id: hardwareId,
      name: 'Keychron K3 Mechanical Keyboard',
      description: 'Low profile with tactile brown switches - perfect for coding',
      url: 'https://www.keychron.com/',
      sort_order: 2,
    },
    {
      category_id: hardwareId,
      name: 'Logitech MX Master 3S',
      description: 'Best mouse for productivity with gesture controls',
      url: 'https://www.logitech.com/mx-master-3s',
      sort_order: 3,
    },
  ]);

  // Development Tools category
  const devToolsId = await insertCategory('Development Tools', 'Code', 1);
  await db('uses_items').insert([
    {
      category_id: devToolsId,
      name: 'VS Code',
      description: 'Primary code editor with Vim extension',
      url: 'https://code.visualstudio.com/',
      sort_order: 0,
    },
    {
      category_id: devToolsId,
      name: 'WebStorm',
      description: 'JetBrains IDE for complex JavaScript/TypeScript projects',
      url: 'https://www.jetbrains.com/webstorm/',
      sort_order: 1,
    },
    {
      category_id: devToolsId,
      name: 'Docker Desktop',
      description: 'Containerization for consistent dev environments',
      url: 'https://www.docker.com/products/docker-desktop/',
      sort_order: 2,
    },
    {
      category_id: devToolsId,
      name: 'Postman',
      description: 'API development and testing',
      url: 'https://www.postman.com/',
      sort_order: 3,
    },
  ]);

  // Design Tools category
  const designId = await insertCategory('Design Tools', 'Brush', 2);
  await db('uses_items').insert([
    {
      category_id: designId,
      name: 'Figma',
      description: 'UI/UX design and prototyping',
      url: 'https://www.figma.com/',
      sort_order: 0,
    },
    {
      category_id: designId,
      name: 'Adobe Creative Cloud',
      description: 'Photoshop, Illustrator, and Premiere Pro for media editing',
      url: 'https://www.adobe.com/creativecloud.html',
      sort_order: 1,
    },
    {
      category_id: designId,
      name: 'Excalidraw',
      description: 'Hand-drawn style diagrams and wireframes',
      url: 'https://excalidraw.com/',
      sort_order: 2,
    },
  ]);

  // CLI & Version Control category
  const cliId = await insertCategory('CLI & Version Control', 'Terminal', 3);
  await db('uses_items').insert([
    {
      category_id: cliId,
      name: 'iTerm2',
      description: 'Terminal replacement with split panes and search',
      url: 'https://iterm2.com/',
      sort_order: 0,
    },
    {
      category_id: cliId,
      name: 'Oh My Zsh',
      description: 'Zsh framework with plugins and themes',
      url: 'https://ohmyz.sh/',
      sort_order: 1,
    },
    {
      category_id: cliId,
      name: 'Starship Prompt',
      description: 'Fast, customizable shell prompt',
      url: 'https://starship.rs/',
      sort_order: 2,
    },
    {
      category_id: cliId,
      name: 'GitHub CLI',
      description: 'Command line interface for GitHub workflows',
      url: 'https://cli.github.com/',
      sort_order: 3,
    },
  ]);

  // Cloud & Hosting category
  const cloudId = await insertCategory('Cloud & Hosting', 'Cloud', 4);
  await db('uses_items').insert([
    {
      category_id: cloudId,
      name: 'Vercel',
      description: 'Frontend deployment and serverless functions',
      url: 'https://vercel.com/',
      sort_order: 0,
    },
    {
      category_id: cloudId,
      name: 'AWS',
      description: 'S3, Lambda, RDS, and more for backend infrastructure',
      url: 'https://aws.amazon.com/',
      sort_order: 1,
    },
    {
      category_id: cloudId,
      name: 'Railway',
      description: 'Simple deployment for databases and services',
      url: 'https://railway.app/',
      sort_order: 2,
    },
    {
      category_id: cloudId,
      name: 'Cloudflare',
      description: 'DNS, CDN, and security',
      url: 'https://www.cloudflare.com/',
      sort_order: 3,
    },
  ]);

  // Workspace category
  const workspaceId = await insertCategory('Workspace', 'Chair', 5);
  await db('uses_items').insert([
    {
      category_id: workspaceId,
      name: 'Standing Desk',
      description: 'Electric sit-stand desk for ergonomic work',
      url: null,
      sort_order: 0,
    },
    {
      category_id: workspaceId,
      name: 'Herman Miller Aeron Chair',
      description: 'Investment in back health for long coding sessions',
      url: 'https://www.hermanmiller.com/products/seating/office-chairs/aeron-chairs/',
      sort_order: 1,
    },
    {
      category_id: workspaceId,
      name: 'Elgato Key Light',
      description: 'Professional lighting for video calls',
      url: 'https://www.elgato.com/key-light',
      sort_order: 2,
    },
    {
      category_id: workspaceId,
      name: 'Sony WH-1000XM5',
      description: 'Noise-canceling headphones for focus time',
      url: 'https://www.sony.com/wh1000xm5',
      sort_order: 3,
    },
  ]);

  console.log('✅ Example uses data seeded successfully!');
}

// Run if called directly
if (require.main === module) {
  seedUses()
    .then(() => closeDb())
    .catch((error) => {
      console.error('Error seeding uses:', error);
      closeDb();
      process.exit(1);
    });
}
