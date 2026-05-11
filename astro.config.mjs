// astro.config.mjs
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// Pure static output — backend is a separate Cloudflare Worker
// Add @astrojs/cloudflare adapter only if SSR pages are needed later
export default defineConfig({
  site: 'https://www.skovgard2026.org',
  output: 'static',
  publicDir: 'static',   // Hugo-style: static/ directory served as public assets
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        // Proxy /api/* to the local Wrangler dev server when running `npm run dev`.
        // Run `cd worker && npx wrangler dev` in a second terminal to back this.
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
  },
});
