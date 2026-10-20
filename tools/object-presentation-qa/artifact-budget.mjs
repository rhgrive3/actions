import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Raw bytes leave 16 MiB for ZIP headers/metadata below the 512 MiB artifact cap.
export const ARTIFACT_LIMIT = 496 * 1024 * 1024;
export const FRAME_LIMIT = 480 * 1024 * 1024;
export function artifactInventory(root) {
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), 'artifact symlinks are not allowed');
      if (stat.isDirectory()) walk(file);
      else { assert(stat.isFile(), 'ordinary artifact files only'); files.push({ file: path.relative(root, file), bytes: stat.size }); }
    }
  };
  walk(root);
  return { totalBytes: files.reduce((n, row) => n + row.bytes, 0), files };
}
export function assertArtifactBudget(root, limit = ARTIFACT_LIMIT) {
  const inventory = artifactInventory(root);
  assert(inventory.totalBytes < limit, 'all suite artifacts, including receipts/diagnostics, must fit below ' + limit + ' bytes');
  return inventory;
}
export function writeBoundedArtifact(root, relative, bytes, limit = ARTIFACT_LIMIT) {
  assert(relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'contained artifact path');
  const target = path.join(root, relative), inventory = assertArtifactBudget(root, limit);
  const prior = inventory.files.find(row => row.file === relative)?.bytes || 0;
  assert(inventory.totalBytes - prior + Buffer.byteLength(bytes) < limit, 'artifact write would exceed total budget');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return assertArtifactBudget(root, limit);
}
