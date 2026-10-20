import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Git --stdin-paths accepts C-quoted names. Encode bytes, not JS UTF-16 units,
// so spaces, quotes, control characters and UTF-8 never become extra paths.
export function quoteGitPath(file) {
  return '"' + [...Buffer.from(file)].map(b => b === 34 || b === 92 ? '\\' + String.fromCharCode(b)
    : b < 32 || b >= 127 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b)).join('') + '"';
}
function sourceFile(root, file) {
  assert(typeof file === 'string' && file && !file.includes('\0') && !path.isAbsolute(file)
    && !file.split('/').some(p => p === '..' || p === '.' || !p), 'canonical contained source path');
  const target = path.join(root, file);
  assert(fs.realpathSync(target).startsWith(root + path.sep), 'source path containment');
  assert(fs.lstatSync(target).isFile(), 'ordinary source file');
  return target;
}
// Fresh for every suite. No cross-run cache and no skipped source receipt.
// Git performs hashing (including attributes/clean/EOL filters), not a raw
// Node reimplementation. Both process count and output order are bounded.
export function sourceCommitVerifier(root, sourceSha, files) {
  root = fs.realpathSync(root);
  assert.match(sourceSha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'fixed source commit');
  assert(Array.isArray(files) && files.length > 0, 'nonempty source inventory');
  const unique = [...new Set(files)], run = (args, input) => execFileSync('git', args,
    { cwd: root, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const tree = new Map(), listing = run(['ls-tree', '-r', '-z', '--full-tree', sourceSha]);
  assert(listing.endsWith('\0'), 'complete NUL tree inventory');
  for (const row of listing.slice(0, -1).split('\0')) {
    const tab = row.indexOf('\t'); assert(tab > 0, 'tree entry delimiter');
    const [mode, type, oid] = row.slice(0, tab).split(' '), file = row.slice(tab + 1);
    assert.match(oid, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'tree object identity');
    assert(!tree.has(file), 'unique tree path'); tree.set(file, { mode, type, oid });
  }
  const snapshots = new Map();
  for (const file of unique) {
    const entry = tree.get(file); assert(entry, 'tracked source commit ' + file);
    assert(entry.type === 'blob' && ['100644', '100755'].includes(entry.mode), 'ordinary committed source ' + file);
    snapshots.set(file, digest(fs.readFileSync(sourceFile(root, file))));
  }
  const output = run(['hash-object', '--stdin-paths'], unique.map(quoteGitPath).join('\n') + '\n');
  assert(output.endsWith('\n'), 'complete hash output');
  const hashes = output.slice(0, -1).split('\n'); assert.equal(hashes.length, unique.length, 'one ordered Git hash per source');
  for (let i = 0; i < unique.length; i++) {
    const file = unique[i]; assert.match(hashes[i], /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Git blob identity');
    assert.equal(hashes[i], tree.get(file).oid, 'source commit ' + file);
    assert.equal(digest(fs.readFileSync(sourceFile(root, file))), snapshots.get(file), 'source stable during Git verification ' + file);
  }
  return (file, bytes = fs.readFileSync(sourceFile(root, file))) => {
    assert(snapshots.has(file), 'source included in verified inventory ' + file);
    assert.equal(digest(bytes), snapshots.get(file), 'source unchanged after Git verification ' + file);
    return tree.get(file).oid;
  };
}
