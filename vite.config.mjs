// ZEVANT production build and account UI development.
//   npm run build:prod  →  vite build: bundles the account UI (code-split, minified, hashed) and then builds the
//                          patched game into dist/ with it, ready for Cloudflare Workers (account/wrangler.toml).
//   npm run dev         →  vite: the built game (_site/) with the account UI live from source + the account API.
// The game modules keep their own per-file pipeline (scripts/build-inkwave.mjs: patches, module preload, offline
// Service Worker); Vite owns the new account bundle and the deployable output.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { accountDevServer, zevantSite } from './account/dev/vite-plugins.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_OUT = path.join(ROOT, '.account-build');

export default defineConfig({
  root: path.join(ROOT, 'account/client'),
  // chunk URLs resolve from the importing module, so the bundle works inside the revisioned _versions/<hash>/ tree
  base: './',
  publicDir: false,
  clearScreen: false,
  build: {
    outDir: ACCOUNT_OUT,
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    target: 'es2022',
    reportCompressedSize: true,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: { account: path.join(ROOT, 'account/client/src/entry.js') },
      output: {
        entryFileNames: 'account-[hash].js',
        chunkFileNames: 'account-[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    fs: { allow: [ROOT] },
  },
  plugins: [accountDevServer(), zevantSite({ outDir: 'dist', accountDir: ACCOUNT_OUT })],
});
