export interface ResumeProfileConfig {
  name: string;
  headline: string;
  summary: string;
  categoryOrder: string[];
}

export const resumeProfile: ResumeProfileConfig = {
  name: 'Your Name',
  headline: 'Full-Stack Developer',
  summary:
    'Experienced software engineer delivering frontend, backend, database, testing, and cloud solutions. Customize this summary in src/user/extensions/resume/profile.ts.',
  categoryOrder: ['frontend', 'backend', 'databases', 'testing', 'devops', 'cloud', 'tools'],
};
