import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/.next/', '**/generated/', '**/coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // AGENTS.md: no `as` to silence the compiler (`as const` stays allowed)
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  prettier,
);
