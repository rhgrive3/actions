#!/usr/bin/env node
// Read-only map of the production source files still rewritten at build time.
// The report measures code ownership, not game behavior or performance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from './inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const normalize = p => p.split(path.sep).join('/');
const DIRECT = Object.freeze([
  'src/game/nav.js',
  'src/game/inkCollision.js',
  'src/world/murals.js',
  'src/world/props.js',
  'src/world/props-marina-vessels.js',
  'src/game/lobbySet-tex.js',
  'patches/splatoon3/runtime/weapons-collision.mjs',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(d => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? walk(full) : [full];
  });
}
function findBuildInputs() {
  const files = [
    ...walk(path.join(SRC, 'src')).filter(f => /\.m?js$/.test(f)),
    ...walk(path.join(SRC, 'styles')).filter(f => f.endsWith('.css')),
    path.join(SRC, 'index.html'),
    path.join(ROOT, 'patches/splatoon3/runtime/weapons-collision.mjs'),
  ];
  return files.map(abs => ({
    abs,
    rel: normalize(path.relative(abs.startsWith(SRC + path.sep) ? SRC : ROOT, abs)),
  })).sort((a, b) => a.rel.localeCompare(b.rel));
}

export function auditDirectSource({ includePaths = false } = {}) {
  const changed = [], directVerified = [], failures = [];
  let totalOriginalBytes = 0, totalComposedBytes = 0, examined = 0;
  const seen = new Set();
  for (const { abs, rel } of findBuildInputs()) {
    if (seen.has(rel)) throw Error('Duplicate source input: ' + rel);
    seen.add(rel);
    const original = fs.readFileSync(abs, 'utf8');
    let composed;
    try {
      composed = adaptBuildSource(rel, original);
    } catch (e) {
      failures.push({ path: rel, error: String(e.message || e) });
      continue;
    }
    const before = Buffer.byteLength(original), after = Buffer.byteLength(composed);
    totalOriginalBytes += before;
    totalComposedBytes += after;
    examined++;
    if (DIRECT.includes(rel)) {
      if (composed !== original) failures.push({ path: rel, error: 'Direct-owned source is still rewritten at build time' });
      else directVerified.push(rel);
    }
    if (composed !== original) changed.push({ path: rel, sourceBytes: before, composedBytes: after, deltaBytes: after - before });
  }
  for (const rel of DIRECT) if (!seen.has(rel))
    failures.push({ path: rel, error: 'Direct-owned source missing from build input scan' });
  changed.sort((a, b) => Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes) || a.path.localeCompare(b.path));
  return {
    sourceFilesExamined: examined,
    sourceFilesRewritten: changed.length,
    sourceFilesDirect: examined - changed.length,
    totalOriginalBytes, totalComposedBytes,
    directOwnerPathsVerified: directVerified.sort(),
    changedPaths: includePaths ? changed : changed.slice(0, 20),
    changedPathsTruncated: !includePaths && changed.length > 20,
    failures,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const full = process.argv.includes('--all');
    const summary = auditDirectSource({ includePaths: full });
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    if (summary.failures.length) process.exitCode = 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}
