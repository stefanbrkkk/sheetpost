/* Lint config for the site's hand-written scripts.
   assets/js/vendor/* is third-party and deliberately excluded. */
export default [
  {
    ignores: ['assets/js/vendor/**', 'node_modules/**']
  },
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        IntersectionObserver: 'readonly',
        URLSearchParams: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        Promise: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Uint8Array: 'readonly',
        matchMedia: 'readonly',
        /* self-hosted vendor globals */
        gsap: 'readonly',
        ScrollTrigger: 'readonly',
        XLSX: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-shadow': 'warn',
      'eqeqeq': ['error', 'smart'],
      'no-console': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'error',
      'no-loop-func': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': 'error',
      'no-implicit-coercion': 'off',
      'no-var': 'off',
      'prefer-const': 'off'
    }
  }
];
