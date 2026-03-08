module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],
    rules: {
        // Unused variables as ERRORS (not warnings)
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            },
        ],
        'no-unused-vars': 'off', // Turn off base rule as it can report incorrect errors

        // Additional strict rules
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': [
            'warn',
            {
                allowExpressions: true,
                allowTypedFunctionExpressions: true,
            },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/require-await': 'warn',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',

        // Relax overly strict type safety rules for external libraries (like Supabase)
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-redundant-type-constituents': 'warn',

        // Code quality rules
        'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
        'prefer-const': 'error',
        'no-var': 'error',
        'eqeqeq': ['error', 'always'],
        'curly': ['error', 'all'],
        'no-throw-literal': 'error',

        // Import rules
        'no-duplicate-imports': 'error',
    },
    ignorePatterns: ['dist', 'node_modules', '*.js'],
    env: {
        node: true,
        es2022: true,
    },
};
