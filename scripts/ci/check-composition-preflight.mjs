#!/usr/bin/env node
// A cheap, read-only preflight of the same adapters used by production builds.
// Missing/duplicate patch anchors are diagnosed before long browser/GPU lanes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function preflightComposition(sourceRoot, {adapt = adaptBuildSource} = {}) {
  const source = path.resolve(sourceRoot);
  const src = path.join(source, 'src');
  if (!fs.statSync(src, {throwIfNoEntry: false})?.isDirectory())
    throw Error('Missing production source directory: ' + src);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.rsync-tmp') continue;
      const filename = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error('Symlink not admitted to source preflight: ' + filename);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile() && /\.(?:m?js|css)$/.test(entry.name)) files.push(filename);
    }
  }
  walk(src);
  for (const entry of ['index.html', 'sw.js']) {
    const filename = path.join(source, entry);
    if (fs.statSync(filename, {throwIfNoEntry: false})?.isFile()) files.push(filename);
  }
  if (!files.length) throw Error('No production source modules discovered');
  let changed = 0;
  for (const file of files) {
    const rel = path.relative(source, file).split(path.sep).join('/');
    const original = fs.readFileSync(file, 'utf8');
    try {
      const composed = adapt(rel, original);
      if (typeof composed !== 'string') throw Error('adapter returned non-string source');
      if (composed !== original) changed++;
    } catch (error) {
      throw new Error('Production composition preflight failed in ' + rel + ': ' + error.message, {cause:error});
    }
  }
  return {files: files.length, changed};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = path.resolve(process.argv[2] || path.join(ROOT, 'inkwave-public'));
    const result = preflightComposition(root);
    console.log('Production composition preflight OK: ' + result.files + ' source files; ' + result.changed + ' adapted');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
