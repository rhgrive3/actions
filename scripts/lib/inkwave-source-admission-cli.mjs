import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// These CLIs have singleton value flags only. Reject ambiguity before reading
// sources or creating scratch/output paths, rather than silently using argv[0].
export function parseSourceAdmissionArgs(argv, allowed, required = []) {
  const supported = new Set(allowed), values = new Map();
  for (let at = 0; at < argv.length; at += 2) {
    const flag = argv[at];
    assert.ok(supported.has(flag), 'unknown argument ' + flag);
    assert.ok(!values.has(flag), 'duplicate ' + flag);
    const value = argv[at + 1];
    assert.ok(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'complete ' + flag);
    values.set(flag, value);
  }
  for (const flag of required) assert.ok(values.has(flag), 'required ' + flag);
  return values;
}

// Resolve existing ancestors as well as the final filename. This protects
// absent legacy leaves and paths passing through a symlinked output directory.
// A dangling symlink or non-directory ancestor is not a safe output path.
function resolvedPath(file) {
  let ancestor = path.resolve(file), tail = [];
  for (;;) {
    try {
      fs.lstatSync(ancestor);
      return path.join(fs.realpathSync(ancestor), ...tail);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Existing dangling symlinks must fail, not be treated as missing paths.
      try { fs.lstatSync(ancestor); throw Error('unresolvable source/receipt path: ' + ancestor); }
      catch (check) { if (check.code !== 'ENOENT') throw check; }
      const parent = path.dirname(ancestor);
      assert.notEqual(parent, ancestor, 'source/receipt path has no resolvable ancestor');
      tail.unshift(path.basename(ancestor)); ancestor = parent;
    }
  }
}
const stat = file => { try { return fs.statSync(file, {bigint: true}); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const within = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

export function assertReceiptSeparate(receipt, roots, paths, gitRoots = roots) {
  const output = resolvedPath(receipt), outputStat = stat(receipt);
  if (outputStat) assert.ok(outputStat.isFile(), 'receipt must be a regular file, not a directory or special file');
  for (const root of roots) for (const relative of paths) {
    const input = path.join(root, relative), resolved = resolvedPath(input), inputStat = stat(input);
    assert.ok(!within(output, resolved) && !within(resolved, output), 'receipt must not replace or overlap an input file: ' + relative);
    assert.ok(!outputStat || !inputStat || outputStat.dev !== inputStat.dev || outputStat.ino !== inputStat.ino,
      'receipt must not alias an input inode: ' + relative);
  }
  // Receipts are generated outputs, never updates to shared hardlinked files.
  // This also protects a hardlink to Git metadata outside the source allowlist.
  if (outputStat) assert.equal(outputStat.nlink, 1n, 'receipt must not overwrite a multiply-linked file');
  const metadata = new Set([...roots, ...gitRoots].map(root => resolvedPath(path.join(root, '.git'))));
  for (const root of new Set(gitRoots)) {
    const result = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
      {encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024});
    assert.equal(result.error, undefined, 'Git metadata resolution must complete');
    if (result.status === 0) for (const directory of result.stdout.trim().split('\n')) metadata.add(resolvedPath(directory));
  }
  for (const directory of metadata)
    assert.ok(!within(output, directory), 'receipt must not overwrite Git metadata used by source declarations');
}
