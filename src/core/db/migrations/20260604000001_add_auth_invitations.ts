import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('auth_invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable();
    table.string('invite_token_hash', 255).notNullable().unique();
    table.jsonb('role_slugs').notNullable().defaultTo(knex.raw('\'["member"]\'::jsonb'));
    table.text('note').nullable();
    table.uuid('invited_by').nullable().references('id').inTable('site_users').onDelete('SET NULL');
    table
      .uuid('redeemed_by_user_id')
      .nullable()
      .references('id')
      .inTable('site_users')
      .onDelete('SET NULL');
    table.timestamp('expires_at').notNullable();
    table.timestamp('redeemed_at').nullable();
    table.timestamp('revoked_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['email']);
  });

  const siteSettingsExists = await knex.schema.hasTable('site_settings');
  if (siteSettingsExists) {
    await knex('site_settings')
      .insert({
        key: 'auth_setup_banner_dismissed',
        value: 'false',
        type: 'boolean',
        category: 'auth',
        description: 'Whether the post-setup admin checklist banner has been dismissed.',
        updated_at: knex.fn.now(),
      })
      .onConflict('key')
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_invitations');

  const siteSettingsExists = await knex.schema.hasTable('site_settings');
  if (siteSettingsExists) {
    await knex('site_settings').where('key', 'auth_setup_banner_dismissed').del();
  }
}
