import type { Knex } from 'knex';

const KEY = 'automation_agent_config';

const DEFAULT_CONFIG = {
  enabled: false,
  postsEnabled: false,
  messagesReadEnabled: false,
  messagesWriteEnabled: false,
  allowCustomAuthor: false,
  defaultAuthorId: null,
  tokenExpiresAt: null,
  allowedIps: [],
  requireHttps: true,
  tokenHash: null,
  tokenHint: null,
  tokenUpdatedAt: null,
};

export async function up(knex: Knex): Promise<void> {
  await knex('site_settings')
    .insert({
      key: KEY,
      value: JSON.stringify(DEFAULT_CONFIG),
      type: 'json',
      category: 'automation',
      description: 'Secure automation agent API configuration',
      updated_at: knex.fn.now(),
    })
    .onConflict('key')
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('site_settings').where('key', KEY).delete();
}
