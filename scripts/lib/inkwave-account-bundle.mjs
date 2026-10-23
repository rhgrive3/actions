// Optional account UI bundle (built by Vite, see vite.config.mjs) inside the revisioned site tree.
// scripts/build-inkwave.mjs uses it only when INKWAVE_ACCOUNT_BUILD names a Vite output directory, so the default
// GitHub Pages build stays exactly as before.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ENTRY_SOURCE = 'src/entry.js';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Copies the Vite chunks to <build>/account/ and returns { entry, files } (published path → sha256). */
export function stageAccountBundle(buildDir, viteOutDir) {
  const manifestFile = path.join(viteOutDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`account bundle: ${manifestFile} is missing (run vite build first)`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = manifest[ENTRY_SOURCE];
  if (!entry?.isEntry || !/^[\w.-]+\.js$/.test(entry.file)) throw new Error('account bundle: manifest has no entry for ' + ENTRY_SOURCE);
  const files = {};
  const dest = path.join(buildDir, 'account');
  if (fs.existsSync(dest)) throw new Error('account bundle would replace an existing account/ directory');
  fs.mkdirSync(dest, { recursive: true });
  for (const chunk of Object.values(manifest)) {
    for (const rel of [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])]) {
      if (!rel || files['account/' + rel]) continue;
      if (rel.includes('..') || path.isAbsolute(rel)) throw new Error('account bundle: unsafe path ' + rel);
      const bytes = fs.readFileSync(path.join(viteOutDir, rel));
      fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
      fs.writeFileSync(path.join(dest, rel), bytes);
      files['account/' + rel] = sha256(bytes);
    }
  }
  return { entry: 'account/' + entry.file, files };
}

/** Adds the account entry as a low-priority module script after the game's own entry. */
export function injectAccountEntry(html, bundle) {
  if (!bundle) return html;
  if (html.split('</body>').length !== 2) throw new Error('account bundle: expected one </body>');
  return html.replace('</body>', `<script type="module" fetchpriority="low" src="./${bundle.entry}"></script>\n</body>`);
}
