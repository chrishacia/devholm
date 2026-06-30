import type { Knex } from 'knex';

const ROLE_DEFINITIONS = [
  {
    slug: 'superadmin',
    name: 'Super Admin',
    description: 'Full control over site configuration, users, and content.',
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Administrative access to site management features.',
  },
  {
    slug: 'editor',
    name: 'Editor',
    description: 'Can manage and publish editorial content.',
  },
  {
    slug: 'member',
    name: 'Member',
    description: 'Authenticated site user with no admin access by default.',
  },
] as const;

const PERMISSION_DEFINITIONS = [
  {
    slug: 'admin.access',
    resource: 'admin',
    action: 'access',
    description: 'Access the admin interface.',
  },
  {
    slug: 'settings.manage',
    resource: 'settings',
    action: 'manage',
    description: 'Manage site settings.',
  },
  {
    slug: 'users.manage',
    resource: 'users',
    action: 'manage',
    description: 'Manage site users and linked accounts.',
  },
  {
    slug: 'roles.manage',
    resource: 'roles',
    action: 'manage',
    description: 'Manage roles and permissions.',
  },
  {
    slug: 'posts.manage',
    resource: 'posts',
    action: 'manage',
    description: 'Create, update, publish, and delete posts.',
  },
  {
    slug: 'projects.manage',
    resource: 'projects',
    action: 'manage',
    description: 'Manage project content.',
  },
  {
    slug: 'media.manage',
    resource: 'media',
    action: 'manage',
    description: 'Manage uploaded media assets.',
  },
  {
    slug: 'messages.manage',
    resource: 'messages',
    action: 'manage',
    description: 'Manage inbox and contact messages.',
  },
  {
    slug: 'resume.manage',
    resource: 'resume',
    action: 'manage',
    description: 'Manage resume content.',
  },
  {
    slug: 'uses.manage',
    resource: 'uses',
    action: 'manage',
    description: 'Manage uses page content.',
  },
] as const;

const ADMIN_PERMISSION_SLUGS = [
  'admin.access',
  'settings.manage',
  'users.manage',
  'roles.manage',
  'posts.manage',
  'projects.manage',
  'media.manage',
  'messages.manage',
  'resume.manage',
  'uses.manage',
];

const SYSTEM_PROVIDERS = [
  { provider_slug: 'google', provider_name: 'Google' },
  { provider_slug: 'github', provider_name: 'GitHub' },
  { provider_slug: 'discord', provider_name: 'Discord' },
] as const;

async function insertDefaultAuthSettings(knex: Knex): Promise<void> {
  const defaults = [
    {
      key: 'auth_credentials_enabled',
      value: 'true',
      type: 'boolean',
      category: 'auth',
      description: 'Whether password/credentials login is enabled.',
    },
    {
      key: 'auth_registration_enabled',
      value: 'false',
      type: 'boolean',
      category: 'auth',
      description: 'Whether new user registration via OAuth is enabled.',
    },
    {
      key: 'auth_account_linking_enabled',
      value: 'true',
      type: 'boolean',
      category: 'auth',
      description: 'Whether existing users can attach additional OAuth providers.',
    },
    {
      key: 'auth_install_completed',
      value: 'false',
      type: 'boolean',
      category: 'auth',
      description: 'Whether the initial auth bootstrap flow has completed.',
    },
  ];

  for (const setting of defaults) {
    await knex('site_settings')
      .insert({
        ...setting,
        updated_at: knex.fn.now(),
      })
      .onConflict('key')
      .ignore();
  }
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('site_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable().unique();
    table.string('display_name').nullable();
    table.text('avatar_url').nullable();
    table.string('primary_auth_provider', 50).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('email_verified_at').nullable();
    table.timestamp('last_login_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('auth_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug', 100).notNullable().unique();
    table.string('name', 150).notNullable();
    table.text('description').nullable();
    table.boolean('is_system').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('auth_permissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug', 150).notNullable().unique();
    table.string('resource', 100).notNullable();
    table.string('action', 100).notNullable();
    table.text('description').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('auth_user_roles', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('site_users').onDelete('CASCADE');
    table.uuid('role_id').notNullable().references('id').inTable('auth_roles').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['user_id', 'role_id']);
  });

  await knex.schema.createTable('auth_role_permissions', (table) => {
    table.uuid('role_id').notNullable().references('id').inTable('auth_roles').onDelete('CASCADE');
    table
      .uuid('permission_id')
      .notNullable()
      .references('id')
      .inTable('auth_permissions')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['role_id', 'permission_id']);
  });

  await knex.schema.createTable('auth_provider_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider_slug', 50).notNullable().unique();
    table.string('provider_name', 150).notNullable();
    table.boolean('enabled').notNullable().defaultTo(false);
    table.text('client_id_encrypted').nullable();
    table.text('client_secret_encrypted').nullable();
    table.text('issuer').nullable();
    table.jsonb('scopes').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb('metadata').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('auth_provider_accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('site_users').onDelete('CASCADE');
    table.string('provider_slug', 50).notNullable();
    table.string('provider_account_id', 255).notNullable();
    table.string('provider_email').nullable();
    table.string('provider_username').nullable();
    table.text('access_token_encrypted').nullable();
    table.text('refresh_token_encrypted').nullable();
    table.timestamp('token_expires_at').nullable();
    table.jsonb('scopes').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb('profile_data').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['provider_slug', 'provider_account_id']);
  });

  await knex.schema.createTable('auth_login_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable().references('id').inTable('site_users').onDelete('SET NULL');
    table.string('provider_slug', 50).nullable();
    table.string('event_type', 50).notNullable();
    table.string('ip_address').nullable();
    table.text('user_agent').nullable();
    table.jsonb('metadata').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  for (const role of ROLE_DEFINITIONS) {
    await knex('auth_roles')
      .insert({
        ...role,
        is_system: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('slug')
      .ignore();
  }

  for (const permission of PERMISSION_DEFINITIONS) {
    await knex('auth_permissions')
      .insert({
        ...permission,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('slug')
      .ignore();
  }

  const roles = await knex('auth_roles').select('id', 'slug');
  const permissions = await knex('auth_permissions').select('id', 'slug');
  const roleIds = new Map(roles.map((role) => [role.slug as string, role.id as string]));
  const permissionIds = new Map(
    permissions.map((permission) => [permission.slug as string, permission.id as string])
  );

  for (const roleSlug of ['superadmin', 'admin']) {
    const roleId = roleIds.get(roleSlug);
    if (!roleId) {
      continue;
    }

    for (const permissionSlug of ADMIN_PERMISSION_SLUGS) {
      const permissionId = permissionIds.get(permissionSlug);
      if (!permissionId) {
        continue;
      }

      await knex('auth_role_permissions')
        .insert({
          role_id: roleId,
          permission_id: permissionId,
          created_at: knex.fn.now(),
        })
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  }

  const editorRoleId = roleIds.get('editor');
  if (editorRoleId) {
    for (const permissionSlug of [
      'admin.access',
      'posts.manage',
      'projects.manage',
      'media.manage',
    ]) {
      const permissionId = permissionIds.get(permissionSlug);
      if (!permissionId) {
        continue;
      }

      await knex('auth_role_permissions')
        .insert({
          role_id: editorRoleId,
          permission_id: permissionId,
          created_at: knex.fn.now(),
        })
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  }

  for (const provider of SYSTEM_PROVIDERS) {
    await knex('auth_provider_configs')
      .insert({
        ...provider,
        enabled: false,
        scopes: JSON.stringify([]),
        metadata: JSON.stringify({ system: true }),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('provider_slug')
      .ignore();
  }

  const adminUsers = await knex('admin_users').select(
    'id',
    'email',
    'display_name',
    'avatar_url',
    'last_login_at',
    'created_at',
    'updated_at'
  );

  for (const adminUser of adminUsers) {
    await knex('site_users')
      .insert({
        id: adminUser.id,
        email: adminUser.email,
        display_name: adminUser.display_name,
        avatar_url: adminUser.avatar_url,
        primary_auth_provider: 'credentials',
        is_active: true,
        last_login_at: adminUser.last_login_at,
        created_at: adminUser.created_at,
        updated_at: adminUser.updated_at,
      })
      .onConflict('id')
      .ignore();
  }

  const superadminRoleId = roleIds.get('superadmin');
  if (superadminRoleId) {
    const siteUsers = await knex('site_users').select('id');
    for (const user of siteUsers) {
      await knex('auth_user_roles')
        .insert({
          user_id: user.id,
          role_id: superadminRoleId,
          created_at: knex.fn.now(),
        })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  }

  const hasUsers = await knex('site_users').first('id');
  await insertDefaultAuthSettings(knex);

  if (hasUsers) {
    await knex('site_settings').where('key', 'auth_install_completed').update({
      value: 'true',
      updated_at: knex.fn.now(),
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_login_events');
  await knex.schema.dropTableIfExists('auth_provider_accounts');
  await knex.schema.dropTableIfExists('auth_provider_configs');
  await knex.schema.dropTableIfExists('auth_role_permissions');
  await knex.schema.dropTableIfExists('auth_user_roles');
  await knex.schema.dropTableIfExists('auth_permissions');
  await knex.schema.dropTableIfExists('auth_roles');
  await knex.schema.dropTableIfExists('site_users');

  const siteSettingsExists = await knex.schema.hasTable('site_settings');
  if (siteSettingsExists) {
    await knex('site_settings')
      .whereIn('key', [
        'auth_registration_enabled',
        'auth_account_linking_enabled',
        'auth_install_completed',
      ])
      .del();
  }
}
