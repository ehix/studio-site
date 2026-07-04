import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { SITE } from './src/config/site';

export default defineConfig({
  site: SITE.url,
  vite: {
    plugins: [tailwindcss()],
  },
});
