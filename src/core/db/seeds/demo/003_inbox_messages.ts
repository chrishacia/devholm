import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const existingMessages = await knex('inbox_messages').count('* as count').first();
  if (existingMessages && Number(existingMessages.count) > 0) {
    console.log('Inbox messages already seeded, skipping...');
    return;
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const messages = [
    {
      source: 'contact',
      name: 'John Developer',
      email: 'john@example.com',
      subject: 'Collaboration Opportunity',
      body: `Hi Chris,\n\nI came across your portfolio and was really impressed by your work on the various projects you've showcased. I'm particularly interested in the way you've implemented the design system.\n\nI'm working on a similar project and would love to discuss potential collaboration opportunities. Would you be available for a quick call sometime this week?\n\nBest regards,\nJohn`,
      status: 'unread',
      created_at: new Date(now.getTime() - 1 * oneDay),
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    {
      source: 'contact',
      name: 'Sarah Smith',
      email: 'sarah@techstartup.io',
      subject: 'Job Opportunity - Senior Frontend Developer',
      body: `Hello Chris,\n\nI'm a recruiter at TechStartup and we're looking for experienced frontend developers. Your background seems like a great fit for our team.\n\nWe offer:\n- Competitive salary\n- Remote-first culture\n- Excellent benefits\n- Equity options\n\nWould you be interested in learning more about the position?\n\nThanks,\nSarah`,
      status: 'unread',
      created_at: new Date(now.getTime() - 2 * oneDay),
      ip_address: '10.0.0.50',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    {
      source: 'blog-comment',
      name: 'DevFan42',
      email: 'devfan@gmail.com',
      subject: 'Question about your Next.js article',
      body: `Great article on Next.js! I had a quick question about the server components implementation. Could you clarify how you handle state management across server and client components?\n\nAlso, how do you deal with caching strategies in a production environment?\n\nThanks for sharing your knowledge!`,
      status: 'read',
      created_at: new Date(now.getTime() - 3 * oneDay),
      read_at: new Date(now.getTime() - 2 * oneDay),
      ip_address: '172.16.0.25',
      user_agent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36',
    },
    {
      source: 'contact',
      name: 'Alex Chen',
      email: 'alex.chen@devagency.com',
      subject: 'Freelance Project Inquiry',
      body: `Hi Chris,\n\nWe're a small agency looking for a freelance developer to help with a React/Node.js project. The project involves building a dashboard for a healthcare client.\n\nTimeline: 3 months\nBudget: Competitive rates\n\nLet me know if you're interested!\n\nAlex`,
      status: 'read',
      created_at: new Date(now.getTime() - 5 * oneDay),
      read_at: new Date(now.getTime() - 4 * oneDay),
      ip_address: '203.0.113.45',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    {
      source: 'contact',
      name: null,
      email: 'anonymous@temp.com',
      subject: 'Quick note',
      body: 'Love your work! Keep it up. Your blog posts have been super helpful for my learning journey.',
      status: 'archived',
      created_at: new Date(now.getTime() - 7 * oneDay),
      read_at: new Date(now.getTime() - 6 * oneDay),
      ip_address: '198.51.100.123',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    },
    {
      source: 'contact',
      name: 'Recruiter Bot',
      email: 'noreply@spammy-recruiter.com',
      subject: 'URGENT: $500k job opportunity!!!',
      body: `CONGRATULATIONS!!! You have been selected for an AMAZING opportunity. Click here to claim your prize...\n\nThis is clearly spam.`,
      status: 'spam',
      created_at: new Date(now.getTime() - 10 * oneDay),
      ip_address: '45.33.32.156',
      user_agent: 'curl/7.68.0',
    },
    {
      source: 'contact',
      name: 'Maria Garcia',
      email: 'maria@opensource.dev',
      subject: 'Open Source Contribution',
      body: `Hey Chris,\n\nI noticed you're interested in open source. I'm the maintainer of a popular React component library and we're looking for contributors.\n\nWould you be interested in collaborating? We have several "good first issue" tickets that might be a good starting point.\n\nCheers,\nMaria`,
      status: 'unread',
      created_at: new Date(now.getTime() - 0.5 * oneDay),
      ip_address: '151.101.1.140',
      user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    },
    {
      source: 'blog-comment',
      name: 'TypeScript Enthusiast',
      email: 'ts-fan@proton.me',
      subject: 'Re: TypeScript Best Practices',
      body: `Your TypeScript article was exactly what I needed! I've been struggling with generic constraints and your examples made it click.\n\nOne suggestion: maybe add a section about discriminated unions? They're super powerful but underused.`,
      status: 'read',
      created_at: new Date(now.getTime() - 4 * oneDay),
      read_at: new Date(now.getTime() - 3 * oneDay),
      ip_address: '104.28.231.45',
      user_agent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    },
  ];

  await knex('inbox_messages').insert(messages);
  console.log(`Seeded ${messages.length} inbox messages`);
}
