import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import { loadEnv } from 'vite';

const isDevCommand = process.argv.some((arg) => arg === 'dev');

const loadServerDevEnv = () => {
  if (!isDevCommand) return;

  const env = loadEnv('development', process.cwd(), '');

  for (const key of [
    'SANITY_API_READ_TOKEN',
    'SANITY_WRITE_TOKEN',
    'OPENAI_API_KEY',
    'OPENAI_SURVEY_SUMMARY_MODEL'
  ]) {
    if (!process.env[key] && env[key]) {
      process.env[key] = env[key];
    }
  }
};

loadServerDevEnv();

export default defineConfig({
  site: 'https://www.retro-gamers.it',
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  vite: {
    cacheDir: isDevCommand ? 'node_modules/.vite/dev' : 'node_modules/.vite/build',
    optimizeDeps: {
      include: [
        'react/compiler-runtime',
        'lodash/isObject.js',
        'lodash/groupBy.js',
        'lodash/keyBy.js',
        'lodash/partition.js',
        'lodash/sortedIndex.js'
      ]
    }
  }
});
