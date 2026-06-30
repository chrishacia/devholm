import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Skills table
  await knex.schema.createTable('skills', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name').notNullable();
    table.string('category').notNullable(); // e.g., 'frontend', 'backend', 'cloud', 'testing', etc.
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Experiences table (work history)
  await knex.schema.createTable('experiences', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title').notNullable();
    table.string('company').notNullable();
    table.string('location').notNullable();
    table.string('employment_type').defaultTo('full-time'); // full-time, contract, part-time
    table.date('start_date').notNullable();
    table.date('end_date').nullable(); // null = current position
    table.boolean('is_current').defaultTo(false);
    table.text('description').nullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Experience highlights (bullet points)
  await knex.schema.createTable('experience_highlights', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('experience_id')
      .notNullable()
      .references('id')
      .inTable('experiences')
      .onDelete('CASCADE');
    table.text('highlight').notNullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Experience technologies (skills used at this job)
  await knex.schema.createTable('experience_technologies', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('experience_id')
      .notNullable()
      .references('id')
      .inTable('experiences')
      .onDelete('CASCADE');
    table.string('technology').notNullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Education table
  await knex.schema.createTable('education', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('degree').notNullable();
    table.string('field_of_study').nullable();
    table.string('school').notNullable();
    table.string('location').nullable();
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.text('description').nullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Certifications table
  await knex.schema.createTable('certifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name').notNullable();
    table.string('issuer').nullable();
    table.date('issue_date').nullable();
    table.date('expiry_date').nullable();
    table.string('credential_id').nullable();
    table.string('credential_url').nullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // Create indexes for better query performance
  await knex.schema.raw('CREATE INDEX idx_skills_category ON skills(category)');
  await knex.schema.raw('CREATE INDEX idx_experiences_current ON experiences(is_current)');
  await knex.schema.raw('CREATE INDEX idx_experiences_dates ON experiences(start_date, end_date)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('certifications');
  await knex.schema.dropTableIfExists('education');
  await knex.schema.dropTableIfExists('experience_technologies');
  await knex.schema.dropTableIfExists('experience_highlights');
  await knex.schema.dropTableIfExists('experiences');
  await knex.schema.dropTableIfExists('skills');
}
