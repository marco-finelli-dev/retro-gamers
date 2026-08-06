import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://www.retro-gamers.it',
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  vite: {
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
