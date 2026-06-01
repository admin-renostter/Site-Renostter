import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            'GITHUB-SITE/**',
            'node_modules/**',
            'coverage/**',
            '.wrangler/**',
            'django-trabalhe-conosco/.venv/**',
            'django-trabalhe-conosco/private_media/**',
            'django-trabalhe-conosco/staticfiles/**',
            'django-trabalhe-conosco/.lancedb/**',
        ],
    },
    js.configs.recommended,
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                ...globals.node,
                Calendly: 'readonly',
                L: 'readonly',
                Swiper: 'readonly',
                gtag: 'readonly',
                CONFIG: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-irregular-whitespace': 'off',
            'no-case-declarations': 'off',
            'no-console': 'off',
        },
    },
];
