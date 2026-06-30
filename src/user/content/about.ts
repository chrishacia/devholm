/**
 * About Page Content
 * ==================
 *
 * CUSTOMIZE: Replace everything below with your own bio, skills, and interests.
 *
 * Icons must be React components from @mui/icons-material (or any icon library).
 * Skills categories: 'frontend' | 'backend' | 'devops' | 'tools' | 'other'
 */

import { Code, Lightbulb, Rocket, Groups, Coffee, Psychology } from '@mui/icons-material';
import type { AboutContent } from '@core/types/content';

export const aboutContent: AboutContent = {
  // Displayed under your name in the hero section
  tagline: 'Full Stack Developer • Open Source Enthusiast',

  // Paragraphs shown in the hero section (add as many as you like)
  intro: [
    "Welcome to my corner of the internet! I'm a passionate developer who loves building things for the web. I enjoy turning complex problems into simple, beautiful, and intuitive solutions.",
    "When I'm not coding, you can find me exploring new technologies, contributing to open source projects, or enjoying a good cup of coffee while reading about the latest trends in web development.",
  ],

  // Paragraphs shown in the "My Journey" section
  story: [
    'I started my journey in software development with a curiosity about how things work on the internet. That curiosity led me to learn HTML, CSS, and JavaScript, and eventually to building full-stack applications with modern frameworks.',
    "Over the years, I've had the opportunity to work on diverse projects, from small business websites to large-scale enterprise applications. Each project has taught me something new and reinforced my love for creating software that makes a difference.",
    'Today, I focus on building accessible, performant, and user-friendly web applications. I believe in writing clean code, continuous learning, and sharing knowledge with the developer community.',
  ],

  // Skills shown as chips — add/remove as needed
  skills: [
    { name: 'React', category: 'frontend' },
    { name: 'TypeScript', category: 'frontend' },
    { name: 'Next.js', category: 'frontend' },
    { name: 'Node.js', category: 'backend' },
    { name: 'PostgreSQL', category: 'backend' },
    { name: 'GraphQL', category: 'backend' },
    { name: 'Docker', category: 'devops' },
    { name: 'AWS', category: 'devops' },
    { name: 'Git', category: 'tools' },
  ],

  // Interests shown as icon cards
  interests: [
    { icon: Code, label: 'Software Development' },
    { icon: Lightbulb, label: 'Learning' },
    { icon: Rocket, label: 'Side Projects' },
    { icon: Groups, label: 'Open Source' },
    { icon: Coffee, label: 'Coffee' },
    { icon: Psychology, label: 'Problem Solving' },
  ],
};
