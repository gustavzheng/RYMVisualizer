import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'public/relation-walk/*.bundle.js', 'next-env.d.ts']),
  {
    files: ['app/album-lab-v2.tsx'],
    rules: {
      // This canvas-heavy view deliberately uses native images for draggable,
      // dynamically sized covers; Next/Image would change its layout contract.
      '@next/next/no-img-element': 'off',
      // Retained legacy visualizations are reference implementations, not live UI.
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern: '^(Duration|Ratings|StreamAreaLegacy|Explore)$',
        argsIgnorePattern: '^open$',
      }],
      '@typescript-eslint/no-unused-expressions': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]);

export default eslintConfig;
