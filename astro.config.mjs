import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://www.retro-gamers.it',
  output: 'server',
  adapter: vercel()
});