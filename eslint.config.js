// ESLint flat config.
//
// Utöver vanlig TS-lint mekaniserar den här filen CLAUDE.md:s hårda regel 1 och 2 för
// packages/core: "får aldrig importera react, DOM, Date, Math.random, crypto, fs eller
// console" och "all slump går via createRng". En prosaregel kan glömmas eller kringgås av
// misstag; ett lintfel kan det inte. Filen är avsiktligt den enda platsen de reglerna kodas
// mekaniskt — ändra dem här, inte genom att undanta enskilda filer.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const coreForbiddenReason = 'packages/core måste förbli headless och rent (CLAUDE.md, hård regel 1).'
const rngReason = 'All slump i packages/core går via createRng(seed, cursor) (CLAUDE.md, hård regel 2).'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Matchar tsc:s inbyggda tolkning av noUnusedParameters/noUnusedLocals: ett
      // understreck framför namnet markerar en medveten platshållare, t.ex. i P0:s
      // otypade resolveTurn-stub.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Hård regel 1 + 2: kärnan är headless, deterministisk och tar aldrig egna I/O- eller
    // slumpbeslut. queries.ts (härledda UI-värden) hashar seed+id för stabila
    // uppskattningar och rör aldrig huvud-Rng:ns cursor, men förbjuds från Math.random
    // precis som allt annat i core — se spec avsnitt 3.3/4.3.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: coreForbiddenReason },
            { name: 'react-dom', message: coreForbiddenReason },
            { name: 'fs', message: coreForbiddenReason },
            { name: 'node:fs', message: coreForbiddenReason },
            { name: 'fs/promises', message: coreForbiddenReason },
            { name: 'node:fs/promises', message: coreForbiddenReason },
            { name: 'crypto', message: coreForbiddenReason },
            { name: 'node:crypto', message: coreForbiddenReason },
            { name: 'http', message: coreForbiddenReason },
            { name: 'node:http', message: coreForbiddenReason },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: coreForbiddenReason + ' Använd state.meta istället.' },
        { name: 'console', message: coreForbiddenReason + ' Emit en WireEvent istället (hård regel 4/6).' },
        { name: 'window', message: coreForbiddenReason },
        { name: 'document', message: coreForbiddenReason },
        { name: 'fetch', message: coreForbiddenReason },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: rngReason,
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: coreForbiddenReason + ' Använd state.meta istället.',
        },
      ],
    },
  },
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['packages/harness/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
)
