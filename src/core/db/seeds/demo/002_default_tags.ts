import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('post_tags').del();
  await knex('tags').del();

  await knex('tags').insert([
    {
      name: 'Science Fiction',
      slug: 'science-fiction',
      description: 'Science fiction books and stories',
    },
    { name: 'Fantasy', slug: 'fantasy', description: 'Fantasy books and magical worlds' },
    {
      name: 'Audiobooks',
      slug: 'audiobooks',
      description: 'Audiobook reviews and recommendations',
    },
    { name: 'Book Reviews', slug: 'book-reviews', description: 'In-depth book reviews' },
    {
      name: 'Space Opera',
      slug: 'space-opera',
      description: 'Epic space adventures and galactic tales',
    },
    { name: 'Series', slug: 'series', description: 'Multi-book series recommendations' },
    { name: 'Narration', slug: 'narration', description: 'Audiobook narration and performance' },
    {
      name: 'Recommendations',
      slug: 'recommendations',
      description: 'Book and audiobook recommendations',
    },
    { name: 'New Releases', slug: 'new-releases', description: 'New and upcoming releases' },
    { name: 'Classics', slug: 'classics', description: 'Classic and must-read titles' },
  ]);

  console.log('✓ Default tags seeded (sci-fi/fantasy audiobook theme)');
}
