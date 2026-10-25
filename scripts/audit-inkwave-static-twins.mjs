#!/usr/bin/env node
// Read-only measurement of the completed publish tree. Byte equality does not
// establish that a public URL is unused, and this audit never removes a file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validRelativePath = rel => typeof rel === 'string' && rel.length > 0 &&
  !rel.includes('\\') && !path.posix.isAbsolute(rel) && !rel.startsWith('../') &&
  path.posix.normalize(rel) === rel && rel !== '.' && rel !== '..';
const stamp = file => {
  const stat = fs.lstatSync(file, { bigint: true });
  assert.ok(stat.isFile(), `regular file required: ${file}`);
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
};

export function auditStaticTwins(directory) {
  const site = fs.realpathSync(directory), inventory = new Map(), stamps = new Map();
  function read(file) {
    const before = stamp(file), bytes = fs.readFileSync(file);
    assert.equal(stamp(file), before, `file changed during inventory: ${file}`);
    stamps.set(file, before);
    return bytes;
  }
  const manifestFile = path.join(site, 'inkwave-build.json');
  const manifestBytes = read(manifestFile), manifest = JSON.parse(manifestBytes);
  const revision = manifest.build?.revision;
  assert.ok(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(revision || ''), 'safe revision namespace');
  assert.ok(manifest.artifacts && !Array.isArray(manifest.artifacts), 'artifact map required');
  assert.equal(sha256(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'manifest content identity');
  const prefix = `_versions/${revision}/`;
  function walk(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const rel = relative + entry.name, file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, rel + '/');
      else {
        assert.ok(entry.isFile(), `symlinks and non-regular entries are not publish inventory: ${rel}`);
        const bytes = file === manifestFile ? manifestBytes : read(file);
        inventory.set(rel, { bytes: bytes.length, sha256: sha256(bytes), inBuildManifest: Object.hasOwn(manifest.artifacts, rel) });
      }
    }
  }
  walk(site);
  for (const [rel, digest] of Object.entries(manifest.artifacts)) {
    assert.ok(validRelativePath(rel) && /^[a-f0-9]{64}$/.test(digest), `valid artifact identity: ${rel}`);
    assert.equal(inventory.get(rel)?.sha256, digest, `completed artifact identity: ${rel}`);
  }
  const pairs = [], rootOnly = [], otherRevisions = [], rootPaths = new Set();
  for (const [rel, versioned] of inventory) {
    if (!rel.startsWith(prefix)) continue;
    const rootPath = rel.slice(prefix.length), root = inventory.get(rootPath);
    rootPaths.add(rootPath);
    pairs.push({ rootPath, versionedPath: rel, status: !root ? 'root-missing' :
      root.bytes === versioned.bytes && root.sha256 === versioned.sha256 ? 'identical' : 'different',
      root: root || null, versioned });
  }
  assert.ok(pairs.length, 'current revision contains files');
  for (const [rel, info] of inventory) {
    if (rel.startsWith('_versions/')) {
      if (!rel.startsWith(prefix)) otherRevisions.push({ path: rel, ...info });
    } else if (!rootPaths.has(rel)) rootOnly.push({ path: rel, ...info });
  }
  const duplicates = pairs.filter(pair => pair.status === 'identical');
  const groups = {};
  for (const pair of duplicates) {
    const group = pair.rootPath.split('/')[0], row = groups[group] ||= { files: 0, bytes: 0 };
    row.files++; row.bytes += pair.root.bytes;
  }
  for (const [file, before] of stamps) assert.equal(stamp(file), before, `tree changed during inventory: ${file}`);
  return {
    schema: 1,
    purpose: 'Read-only completed-tree inventory; equal bytes do not prove either public URL is unused.',
    build: { revision, contentHash: manifest.contentHash, inputHash: manifest.inputHash,
      manifestSHA256: sha256(manifestBytes), optimization: manifest.build.optimization || null },
    summary: {
      totalFiles: inventory.size, totalLogicalBytes: [...inventory.values()].reduce((sum, row) => sum + row.bytes, 0),
      manifestArtifactsVerified: Object.keys(manifest.artifacts).length,
      filesOutsideArtifactMap: [...inventory.values()].filter(row => !row.inBuildManifest).length,
      currentRevisionFiles: pairs.length, identicalPairs: duplicates.length,
      identicalRootLogicalBytes: duplicates.reduce((sum, pair) => sum + pair.root.bytes, 0),
      differentPairs: pairs.filter(pair => pair.status === 'different').length,
      missingRootPairs: pairs.filter(pair => pair.status === 'root-missing').length,
      rootOnlyFiles: rootOnly.length, otherRevisionFiles: otherRevisions.length,
      actualFilesRemoved: 0, actualBytesRemoved: 0,
    },
    duplicateGroups: groups,
    largestIdenticalPairs: [...duplicates].sort((a, b) => b.root.bytes - a.root.bytes || a.rootPath.localeCompare(b.rootPath, 'en')).slice(0, 20),
    pairs, rootOnly, otherRevisions,
    limitations: [
      'Logical file bytes are measured; archive compression, upload time, HTTP transfer and disk block sharing are not measured.',
      'Static file equality does not establish URL reachability, old-client compatibility, Service Worker update behavior or Workers asset routing.',
      'No candidate is authorized for deletion by this inventory. Root and revisioned URL contracts require separate evidence.',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
  const site = option('--site', '_site'), output = path.resolve(option('--output', '.ci-scratch/static-twins-inventory.json'));
  const realSite = fs.realpathSync(site);
  assert.ok(output !== realSite && !output.startsWith(realSite + path.sep), 'write the audit outside the completed publish tree');
  const result = auditStaticTwins(site);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result.summary, output }));
}
