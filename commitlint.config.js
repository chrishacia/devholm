/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subjects for detailed commit messages
    'subject-max-length': [1, 'always', 100],
    // Common scopes for this project (warn only — new scopes welcome)
    'scope-enum': [
      1,
      'always',
      [
        'core',
        'user',
        'config',
        'app',
        'components',
        'db',
        'auth',
        'api',
        'theme',
        'hooks',
        'lib',
        'views',
        'admin',
        'blog',
        'seo',
        'ci',
        'deps',
        'release',
      ],
    ],
  },
};
