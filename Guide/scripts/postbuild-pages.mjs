// postbuild-pages.mjs
// Converts the adapter's Workers-format output into Cloudflare Pages advanced mode format.
// The adapter emits:
//   dist/client/     — static assets
//   dist/server/     — worker code + Workers wrangler.json
// Pages advanced mode expects:
//   dist/client/_worker.js          — Pages Function entry point
//   dist/client/server/             — worker chunks (referenced by _worker.js)
import { cpSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const clientDir = resolve(root, 'dist/client');
const serverDir = resolve(root, 'dist/server');
const serverInClient = resolve(clientDir, 'server');

// 1. Copy dist/server/ → dist/client/server/
if (existsSync(serverInClient)) rmSync(serverInClient, { recursive: true });
cpSync(serverDir, serverInClient, { recursive: true });

// 2. Create dist/client/_worker.js — re-exports the worker default from server/entry.mjs
writeFileSync(
  resolve(clientDir, '_worker.js'),
  `import worker from './server/entry.mjs';\nexport default worker;\n`
);

console.log('postbuild-pages: _worker.js written, server/ copied into client/');
