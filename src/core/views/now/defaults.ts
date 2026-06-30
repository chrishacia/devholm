/**
 * Default Now Page Content
 */

import { Code, MenuBook, Explore, Build } from '@mui/icons-material';
import type { NowContent } from '@core/types/content';

export const DEFAULT_NOW_CONTENT: NowContent = {
  lastUpdated: new Date(),
  location: 'Working remotely',
  currentProject: {
    name: 'My Current Project',
    tagline: "A brief description of what you're building",
    description: `This is where you can describe your main project or focus area.
What are you building? Why is it interesting? What problems does it solve?

Update this section in src/user/content/now.ts to share what you're passionate about right now.`,
    features: [
      'Feature or goal one',
      'Feature or goal two',
      'Feature or goal three',
      'Feature or goal four',
    ],
    techStack: {
      frontend: ['Next.js', 'React', 'TypeScript'],
      backend: ['Node.js', 'PostgreSQL'],
      tools: ['Docker', 'GitHub Actions'],
    },
  },
  sections: [
    {
      icon: Code,
      title: 'Currently Building',
      items: [
        'Working on my personal website',
        'Building side projects to learn new technologies',
        'Contributing to open source projects',
        'Writing blog posts about what I learn',
      ],
    },
    {
      icon: MenuBook,
      title: 'Currently Learning',
      items: [
        'Exploring new frameworks and libraries',
        'Reading about software architecture patterns',
        'Taking online courses to expand skills',
        'Learning from the developer community',
      ],
    },
    {
      icon: Explore,
      title: 'Exploring',
      items: [
        'New technologies and trends in web development',
        'Best practices for building scalable applications',
        'Ways to improve developer experience',
        'Community events and meetups',
      ],
    },
    {
      icon: Build,
      title: 'Goals',
      items: [
        'Ship more projects and ideas',
        'Write more and share knowledge',
        'Connect with other developers',
        'Keep learning and growing',
      ],
    },
  ],
  focus: ['Web Development', 'Open Source', 'Learning', 'Building', 'Writing', 'Community'],
};
