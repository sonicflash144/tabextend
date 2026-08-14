import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: [
            'dist/**',
            'build/**',
            'node_modules/**',
            'coverage/**'
        ]
    },
    js.configs.recommended,
    {
        files: [
            'newtab.js',
            'background.js',
            'src/**/*.js',
            'src/**/*.mjs'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.webextensions
            }
        }
    },
    {
        files: ['test/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node
        }
    },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node
        }
    },
    {
        files: ['webpack.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node
        }
    },
    configPrettier
];
