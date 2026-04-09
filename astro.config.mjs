// astro.config.mjs
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// Pure static output — backend is a separate Cloudflare Worker
// Add @astrojs/cloudflare adapter only if SSR pages are needed later
export default defineConfig({
  site: 'https://www.skovgard2026.org',
  output: 'static',
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
