#!/usr/bin/env node
// Build the INKWAVE GitHub Pages site with the independent gameplay patches applied to the output tree.
// Keep inkwave-public/ unchanged, then minify every JS and CSS file
// (esbuild, per file — the ES-module layout, import.meta.url asset URLs and the import map stay exactly as they are)
// and <link rel="modulepreload"> hints for every module the boot needs, so the browser fetches the whole graph in
// parallel instead of discovering it import by import. The gameplay adapter must pass compatibility checks.
//
//   node scripts/build-inkwave.mjs [src=inkwave-public] [out=_site]
//   (needs esbuild: `npm i --no-save esbuild`, or set ESBUILD_MODULE=/path/to/esbuild/lib/main.js)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pathToFileURL } from 'url';
import { PATCH_ROOT, checkCompatibility, adaptSource, writeBuildIdentity, sha256 } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout, touchLayoutIdentity } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability, reliabilityIdentity, RELIABILITY_ROOT } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity, QUALITY_ROOT } from '../patches/local-quality/adapter.mjs';
import { adaptNetworkSource, networkIdentity, NETWORK_ROOT } from '../patches/network-replication/adapter.mjs';
import { LOADING_ROOT, prepareLoading, finalizeLoadingWorker, loadingIdentity } from '../patches/loading-cache/adapter.mjs';
import { adaptRange, rangeIdentity, RANGE_ROOT } from '../patches/practice-range/adapter.mjs';

const adaptBuildSource = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

const physicalLocation = name => fs.existsSync(name) ? fs.realpathSync(name) : path.join(physicalLocation(path.dirname(name)),path.basename(name));
const SRC = physicalLocation(path.resolve(process.argv[2] || 'inkwave-public'));
const OUT = physicalLocation(path.resolve(process.argv[3] || '_site'));
if (fs.existsSync(OUT) && !fs.statSync(OUT).isDirectory()) throw new Error('Build output must be a directory');
const projectRoot = path.resolve(PATCH_ROOT, '../..');
const contains = (parent, child) => parent === child || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
if (contains(OUT, projectRoot) || contains(OUT, SRC) || contains(SRC, OUT) || contains(PATCH_ROOT, OUT) || contains(RELIABILITY_ROOT, OUT) || contains(QUALITY_ROOT, OUT) || contains(NETWORK_ROOT, OUT) || contains(LOADING_ROOT, OUT) || contains(RANGE_ROOT, OUT)) throw new Error('Build output must be separate from upstream source and patch files');
checkCompatibility(SRC);
const esbuild = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
const SKIP = new Set(['FETCH_MANIFEST.json', 'README_FETCH.txt']);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

// Build as a transaction: only a fully patched, validated tree replaces OUT.
const BUILD = OUT + '.building';
fs.rmSync(BUILD, { recursive: true, force: true });
let rawJs = 0, minJs = 0, gzRaw = 0, gzMin = 0, rawCss = 0, minCss = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  if (SKIP.has(rel)) continue;
  const dst = path.join(BUILD, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const ext = path.extname(file);
  if (ext === '.js' || ext === '.mjs' || ext === '.css') {
    const code = adaptBuildSource(rel, fs.readFileSync(file, 'utf8'));
    const res = await esbuild.transform(code, {
      loader: ext === '.css' ? 'css' : 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: rel,
    });
    fs.writeFileSync(dst, res.code);
    if (ext === '.css') { rawCss += code.length; minCss += res.code.length; }
    else { rawJs += Buffer.byteLength(code); minJs += Buffer.byteLength(res.code); gzRaw += gz(Buffer.from(code)); gzMin += gz(Buffer.from(res.code)); }
  } else if (rel === 'index.html') fs.writeFileSync(dst, adaptBuildSource(rel, fs.readFileSync(file, 'utf8')));
  else fs.copyFileSync(file, dst);
}
for (const file of walk(PATCH_ROOT)) {
  const rel = path.relative(PATCH_ROOT, file);
  if (rel.startsWith('tests/') || rel.endsWith('.md') || rel === 'adapter.mjs' || rel === 'upstream-lock.json') continue;
  const dst = path.join(BUILD, 'patches/splatoon3', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (/\.(m?js|css)$/.test(rel)) {
    const patchRel = 'patches/splatoon3/' + rel.split(path.sep).join('/');
    const code = adaptBuildSource(patchRel, fs.readFileSync(file, 'utf8'));
    const res = await esbuild.transform(code, { loader: rel.endsWith('.css') ? 'css' : 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: patchRel });
    fs.writeFileSync(dst, res.code);
  } else fs.copyFileSync(file, dst);
}
for (const file of walk(QUALITY_ROOT)) {
  const rel = path.relative(QUALITY_ROOT, file);
  if (rel.startsWith('tests/') || rel.endsWith('.md') || rel === 'adapter.mjs') continue;
  const dst = path.join(BUILD, 'patches/local-quality', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (/\.(m?js|css)$/.test(rel)) {
    const res = await esbuild.transform(adaptBuildSource('patches/local-quality/' + rel.split(path.sep).join('/'), fs.readFileSync(file, 'utf8')), { loader: rel.endsWith('.css') ? 'css' : 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: 'patches/local-quality/' + rel.split(path.sep).join('/') });
    fs.writeFileSync(dst, res.code);
  } else fs.copyFileSync(file, dst);
}

// Practice Range layer: runtime modules + stylesheet under patches/practice-range/ (tests, docs, the adapter and the
// offline bake tools stay out), its stage assets (lightmap, menu art) overlaid at their upstream paths — never over an
// existing upstream file.
for (const file of walk(RANGE_ROOT)) {
  const rel = path.relative(RANGE_ROOT, file).split(path.sep).join('/');
  if (rel.startsWith('tests/') || rel.startsWith('tools/') || rel.endsWith('.md') || rel === 'adapter.mjs') continue;
  if (rel.startsWith('assets/')) {
    const dst = path.join(BUILD, rel);
    if (fs.existsSync(dst)) throw new Error(`Practice Range asset would replace an upstream file: ${rel}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(file, dst);
    continue;
  }
  const dst = path.join(BUILD, 'patches/practice-range', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (/\.(m?js|css)$/.test(rel)) {
    const res = await esbuild.transform(fs.readFileSync(file, 'utf8'), { loader: rel.endsWith('.css') ? 'css' : 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: 'patches/practice-range/' + rel });
    fs.writeFileSync(dst, res.code);
  } else fs.copyFileSync(file, dst);
}

// Service workers only control ancestor paths when served from the site root.
// Keep the manifest/icons revisioned, but publish the worker itself as /sw.js.
const pwaWorker = path.join(PATCH_ROOT, 'pwa', 'sw.js');
if (fs.existsSync(pwaWorker)) fs.copyFileSync(pwaWorker, path.join(BUILD, 'sw.js'));

// ---- three.js: tree-shake to the symbols the game (and the bundled three/addons) actually use. Every `THREE.x`
// access in the sources is static (verified: no computed THREE[...] lookups), so the namespace keeps what it needs.
const THREE_DIR = path.join(SRC, 'vendor/three/build');
if (fs.existsSync(path.join(THREE_DIR, 'three.module.js')) && process.env.INKWAVE_NO_THREE_SHAKE !== '1') {
  const srcFiles = [...walk(path.join(SRC, 'src')), ...walk(path.join(SRC, 'vendor/three/jsm')), ...walk(PATCH_ROOT), ...walk(QUALITY_ROOT), ...walk(RANGE_ROOT)].filter((f) => /\.m?js$/.test(f) && !f.includes('/tests/'));
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
  const before = fs.statSync(path.join(BUILD, 'vendor/three/build/three.module.js')).size + fs.statSync(path.join(BUILD, 'vendor/three/build/three.core.js')).size;
  fs.writeFileSync(path.join(BUILD, 'vendor/three/build/three.module.js'), out);
  fs.rmSync(path.join(BUILD, 'vendor/three/build/three.core.js'));
  console.log(`three.js: ${keep.length} of ${exported.size} exports kept · ${kb(before)} → ${kb(out.length)} (gzip ${kb(gz(Buffer.from(out)))})`);
}

// ---- module graph from src/main.js (static imports + the string-literal dynamic imports the boot always performs)
const html0 = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
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
  const abs = path.join(BUILD, rel);
  if (!fs.existsSync(abs)) return;
  seen.add(rel);
  const original = rel.startsWith('patches/splatoon3/') ? path.join(PATCH_ROOT, rel.slice('patches/splatoon3/'.length)) : rel.startsWith('patches/local-quality/') ? path.join(QUALITY_ROOT, rel.slice('patches/local-quality/'.length)) : rel.startsWith('patches/practice-range/') ? path.join(RANGE_ROOT, rel.slice('patches/practice-range/'.length)) : path.join(SRC, rel);
  const s = fs.existsSync(original) ? adaptBuildSource(rel, fs.readFileSync(original, 'utf8')) : fs.readFileSync(abs, 'utf8');
  const specs = [];
  for (const m of s.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of s.matchAll(/(?:loadModule|import)\(\s*['"]([^'"]+\.js)['"]/g)) specs.push(m[1]);
  for (const sp of specs) visit(resolve(rel, sp));
  order.push(rel);
};
visit('src/main.js');
visit('patches/splatoon3/bootstrap.mjs');
// #61's accepted startup baseline preloaded 145 modules (131 core + 14 range).
// Later workstreams add these runtime dependencies to the static graph. Keep
// them in the immutable revision + Service Worker precache, but let their
// importing modules request them instead of adding 16 new eager preload
// requests to the critical HTML. Browser startup/offline CI validates the
// resulting dependency fetch path and timing.
const deferredIntegrationPreloads = new Set([
  'patches/local-quality/first-touch-adapter.mjs',
  'patches/local-quality/gyro-permission.mjs',
  'patches/local-quality/idle-resources.mjs',
  'patches/local-quality/mobile-platform.mjs',
  'patches/local-quality/music-idle.mjs',
  'patches/local-quality/platform-audio.mjs',
  'patches/local-quality/platform-game.mjs',
  'patches/local-quality/platform-input.mjs',
  'patches/local-quality/platform-lifecycle.mjs',
  'patches/local-quality/platform-transport.mjs',
  'patches/local-quality/touch-relayout.mjs',
  'patches/splatoon3/issue-498-adapter.mjs',
  'patches/splatoon3/runtime/issue-415-adapter.mjs',
  'patches/splatoon3/runtime/issue-416-adapter.mjs',
  'patches/splatoon3/runtime/movement-physics.mjs',
  'patches/splatoon3/runtime/roller-model.mjs',
  'patches/splatoon3/runtime/sub-special-fidelity.mjs',
  'patches/splatoon3/runtime/weapon-edgecases.mjs',
  'patches/splatoon3/runtime/weapons-collision.mjs',
  'patches/splatoon3/runtime/weapons-charger-flight.mjs',
  'patches/splatoon3/runtime/weapons-fidelity.mjs',
]);
const preloadOrder = order.filter((f) => !deferredIntegrationPreloads.has(f));
const preload = preloadOrder.filter((f) => fs.existsSync(path.join(BUILD, f))).map((f) => `<link rel="modulepreload" href="./${f}">`).join('\n');
const html = html0.replace('</head>', `<!-- build: module graph preloaded (${preloadOrder.length} modules) -->\n${preload}\n</head>`);
fs.writeFileSync(path.join(BUILD, 'index.html'), html);
fs.writeFileSync(path.join(BUILD, '.nojekyll'), '');
const loadingPlan = prepareLoading(BUILD, order);
const loadingHTML = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
// Give the entire module/asset tree an immutable URL. A cached old module must
// never import a newer profile or dependency after the next OSS update.
const revision = sha256(JSON.stringify(walk(BUILD).sort().map(file => [path.relative(BUILD,file),sha256(fs.readFileSync(file))])));
const versionFiles = walk(BUILD);
for (const file of versionFiles) {
  const rel = path.relative(BUILD,file);
  if (rel === 'index.html' || rel === '.nojekyll') continue;
  const dst = path.join(BUILD,'_versions',revision,rel); fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.copyFileSync(file,dst);
}
// Place base before the import map so all relative imports, preload hints,
// stylesheet URLs and runtime fetches resolve within the same revision.
fs.writeFileSync(path.join(BUILD,'index.html'), loadingHTML.replace('<head>', `<head>\n<base href="./_versions/${revision}/">`));
const loadingSummary = finalizeLoadingWorker(BUILD, revision, loadingPlan);
const identity = writeBuildIdentity(SRC, BUILD, PATCH_ROOT, { esbuild:esbuild.version, revision, script:sha256(fs.readFileSync(new URL(import.meta.url))), touchLayout:touchLayoutIdentity(), reliability:reliabilityIdentity(), quality:qualityIdentity(), network:networkIdentity(), range:rangeIdentity(), loadingCache:{ source:loadingIdentity(), ...loadingSummary } });
// Include the independent editor in exact-source verification, not only artifact hashing.
for (const [file, hash] of Object.entries(identity.build.touchLayout)) identity.files['touch-layout/' + file] = hash;
for (const [file, hash] of Object.entries(identity.build.reliability)) identity.files['reliability/' + file] = hash;
for (const [file, hash] of Object.entries(identity.build.quality)) identity.files['local-quality/' + file] = hash;
for (const [file, hash] of Object.entries(identity.build.network)) identity.files['network-replication/' + file] = hash;
for (const [file, hash] of Object.entries(identity.build.range)) identity.files['practice-range/' + file] = hash;
for (const [file, hash] of Object.entries(identity.build.loadingCache.source)) identity.files['loading-cache/' + file] = hash;
identity.inputHash = sha256(JSON.stringify(identity.files));
fs.writeFileSync(path.join(BUILD, 'inkwave-build.json'), JSON.stringify(identity, null, 2) + '\n');
fs.rmSync(OUT, { recursive: true, force: true });
fs.renameSync(BUILD, OUT);
console.log(`patch: splatoon3+quality+range · build ${identity.contentHash.slice(0, 12)}`);

console.log(`JS : ${kb(rawJs)} → ${kb(minJs)}  (gzip ${kb(gzRaw)} → ${kb(gzMin)})`);
console.log(`CSS: ${kb(rawCss)} → ${kb(minCss)}`);
console.log(`modulepreload: ${preloadOrder.length} modules (${order.length - preloadOrder.length} deferred, all precached)`);
