// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // TODO: set the real domain before deploying to Cloudflare Pages
  site: 'https://example.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
