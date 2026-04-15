import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/server';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
});