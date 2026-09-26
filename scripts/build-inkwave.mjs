#!/usr/bin/env node
// Build the INKWAVE GitHub Pages site: a byte-for-byte copy of inkwave-public/ with every JS and CSS file minified
// (esbuild, per file — the ES-module layout, import.meta.url asset URLs and the import map stay exactly as they are)
// and <link rel="modulepreload"> hints for every module the boot needs, so the browser fetches the whole graph in
// parallel instead of discovering it import by import. Nothing is re-bundled, so behaviour cannot change.
//
//   node scripts/build-inkwave.mjs [src=inkwave-public] [out=_site]
//   (needs esbuild: `npm i --no-save esbuild`, or set ESBUILD_MODULE=/path/to/esbuild/lib/main.js)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pathToFileURL } from 'url';

const SRC = path.resolve(process.argv[2] || 'inkwave-public');
const OUT = path.resolve(process.argv[3] || '_site');
const esbuild = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
const SKIP = new Set(['FETCH_MANIFEST.json', 'README_FETCH.txt']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

fs.rmSync(OUT, { recursive: true, force: true });
let rawJs = 0, minJs = 0, gzRaw = 0, gzMin = 0, rawCss = 0, minCss = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  if (SKIP.has(rel)) continue;
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const ext = path.extname(file);
  if (ext === '.js' || ext === '.mjs' || ext === '.css') {
    const code = fs.readFileSync(file, 'utf8');
    const res = await esbuild.transform(code, {
      loader: ext === '.css' ? 'css' : 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: rel,
    });
    fs.writeFileSync(dst, res.code);
    if (ext === '.css') { rawCss += code.length; minCss += res.code.length; }
    else { rawJs += Buffer.byteLength(code); minJs += Buffer.byteLength(res.code); gzRaw += gz(Buffer.from(code)); gzMin += gz(Buffer.from(res.code)); }
  } else fs.copyFileSync(file, dst);
}

// ---- three.js: tree-shake to the symbols the game (and the bundled three/addons) actually use. Every `THREE.x`
// access in the sources is static (verified: no computed THREE[...] lookups), so the namespace keeps what it needs.
const THREE_DIR = path.join(SRC, 'vendor/three/build');
if (fs.existsSync(path.join(THREE_DIR, 'three.module.js')) && process.env.INKWAVE_NO_THREE_SHAKE !== '1') {
  const srcFiles = [...walk(path.join(SRC, 'src')), ...walk(path.join(SRC, 'vendor/three/jsm'))].filter((f) => f.endsWith('.js'));
  const used = new Set();
  for (const f of srcFiles) {
    const s = fs.readFileSync(f, 'utf8');
    if (/THREE\s*\[/.test(s)) throw new Error(`computed THREE[...] access in ${f}: cannot tree-shake three.js safely`);
    for (const m of s.matchAll(/THREE\.([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
    for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]three['"]/g)) m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => used.add(n));
  }
  const modSrc = fs.readFileSync(path.join(THREE_DIR, 'three.module.js'), 'utf8');
  const exported = new Set();
  for (const m of modSrc.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((n) => exported.add(n));
  const keep = [...used].filter((n) => exported.has(n)).sort();
  const res = await esbuild.build({
    stdin: { contents: `export { ${keep.join(', ')} } from './three.module.js';`, resolveDir: THREE_DIR, sourcefile: 'three-slim.js' },
    bundle: true, format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline', write: false, logLevel: 'warning',
  });
  const out = res.outputFiles[0].contents;
  const before = fs.statSync(path.join(OUT, 'vendor/three/build/three.module.js')).size + fs.statSync(path.join(OUT, 'vendor/three/build/three.core.js')).size;
  fs.writeFileSync(path.join(OUT, 'vendor/three/build/three.module.js'), out);
  fs.rmSync(path.join(OUT, 'vendor/three/build/three.core.js'));
  console.log(`three.js: ${keep.length} of ${exported.size} exports kept · ${kb(before)} → ${kb(out.length)} (gzip ${kb(gz(Buffer.from(out)))})`);
}

// ---- module graph from src/main.js (static imports + the string-literal dynamic imports the boot always performs)
const html0 = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const map = JSON.parse((html0.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [, '{"imports":{}}'])[1]).imports || {};
const resolve = (from, spec) => {
  for (const [k, v] of Object.entries(map)) {
    if (k.endsWith('/') ? spec.startsWith(k) : spec === k) return path.posix.normalize(v.replace(/^\.\//, '') + (k.endsWith('/') ? spec.slice(k.length) : ''));
  }
  if (!spec.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
};
const seen = new Set();
const order = [];
const visit = (rel) => {
  if (!rel || seen.has(rel) || rel.includes('/dev/')) return;
  const abs = path.join(SRC, rel);
  if (!fs.existsSync(abs)) return;
  seen.add(rel);
  const s = fs.readFileSync(abs, 'utf8');
  const specs = [];
  for (const m of s.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of s.matchAll(/(?:loadModule|import)\(\s*['"]([^'"]+\.js)['"]/g)) specs.push(m[1]);
  for (const sp of specs) visit(resolve(rel, sp));
  order.push(rel);
};
visit('src/main.js');
const preload = order.filter((f) => fs.existsSync(path.join(OUT, f))).map((f) => `<link rel="modulepreload" href="./${f}">`).join('\n');
const html = html0.replace('</head>', `<!-- build: module graph preloaded (${order.length} modules) -->\n${preload}\n</head>`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`JS : ${kb(rawJs)} → ${kb(minJs)}  (gzip ${kb(gzRaw)} → ${kb(gzMin)})`);
console.log(`CSS: ${kb(rawCss)} → ${kb(minCss)}`);
console.log(`modulepreload: ${order.length} modules`);
