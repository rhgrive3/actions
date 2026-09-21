import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  copyIfMissing,
  ensureMetadata,
  moveDirectoryIfMissing,
  replaceWithSymlinkAtomically,
} from '../scripts/freebuff-setup.mjs';

function swapDirectory(realDir, outside) {
  const moved = `${realDir}-old`;
  fs.renameSync(realDir, moved);
  fs.symlinkSync(outside, realDir, 'dir');
  return moved;
}

test('#9352 copyIfMissing cannot escape through an ancestor swapped after validation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-9352-copy-'));
  try {
    const home = path.join(root, 'home');
    const outside = path.join(root, 'outside');
    const src = path.join(root, 'settings-source.json');
    fs.mkdirSync(home);
    fs.mkdirSync(outside);
    fs.writeFileSync(src, '{"safe":true}\n');
    fs.writeFileSync(path.join(outside, 'settings.json'), 'KEEP\n');
    let swapped = false;
    const fsImpl = {
      ...fs,
      copyFileSync(from, to, flags) {
        if (!swapped) {
          swapped = true;
          swapDirectory(home, outside);
        }
        return fs.copyFileSync(from, to, flags);
      },
    };
    assert.throws(
      () => copyIfMissing(src, path.join(home, 'settings.json'), false, home, { fsImpl }),
      /directory identity changed/,
    );
    assert.equal(fs.readFileSync(path.join(outside, 'settings.json'), 'utf8'), 'KEEP\n');
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('#9352 metadata publication cannot write through a swapped parent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-9352-meta-'));
  try {
    const home = path.join(root, 'home');
    const dir = path.join(home, '.config', 'manicode');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(dir, { recursive:true });
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, 'freebuff-metadata.json');
    fs.writeFileSync(sentinel, 'KEEP\n');
    let swapped = false;
    const fsImpl = {
      ...fs,
      writeFileSync(file, data, options) {
        if (!swapped && path.basename(file).startsWith('.freebuff-metadata.json.tmp-')) {
          swapped = true;
          swapDirectory(dir, outside);
        }
        return fs.writeFileSync(file, data, options);
      },
    };
    assert.equal(ensureMetadata(dir, { version:'1.2.3' }, home, { fsImpl }), false);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'KEEP\n');
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('#9352 symlink reconciliation never publishes into a swapped external directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-9352-link-'));
  try {
    const dir = path.join(root, 'manicode');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(dir);
    fs.mkdirSync(outside);
    const linkPath = path.join(dir, 'rg');
    fs.writeFileSync(linkPath, 'OLD\n');
    fs.writeFileSync(path.join(outside, 'rg'), 'KEEP\n');
    let swapped = false;
    const fsImpl = {
      ...fs,
      symlinkSync(target, file, type) {
        if (!swapped && path.basename(file).includes('.link-')) {
          swapped = true;
          swapDirectory(dir, outside);
        }
        return fs.symlinkSync(target, file, type);
      },
    };
    assert.throws(
      () => replaceWithSymlinkAtomically(linkPath, '../target', { fsImpl }),
      /directory identity changed/,
    );
    assert.equal(fs.readFileSync(path.join(outside, 'rg'), 'utf8'), 'KEEP\n');
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});

test('#9352 directory migration rolls back when destination parent identity changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-9352-move-'));
  try {
    const sourceParent = path.join(root, 'repo');
    const persistent = path.join(root, 'persistent');
    const parent = path.join(persistent, '1');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(sourceParent);
    fs.mkdirSync(parent, { recursive:true });
    fs.mkdirSync(outside);
    const src = path.join(sourceParent, 'home');
    const dst = path.join(parent, 'home');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'sentinel'), 'SOURCE\n');
    fs.writeFileSync(path.join(outside, 'sentinel'), 'KEEP\n');
    let swapped = false;
    const fsImpl = {
      ...fs,
      renameSync(from, to) {
        if (!swapped && from === src && path.basename(to) === 'home') {
          swapped = true;
          swapDirectory(parent, outside);
        }
        return fs.renameSync(from, to);
      },
    };
    assert.throws(
      () => moveDirectoryIfMissing(src, dst, { containmentRoot:persistent, fsImpl }),
      /directory identity changed/,
    );
    assert.equal(fs.readFileSync(path.join(src, 'sentinel'), 'utf8'), 'SOURCE\n');
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'KEEP\n');
    assert.equal(fs.existsSync(path.join(outside, 'home')), false);
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});
