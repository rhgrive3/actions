// Emitted Web Audio-independent gyro arithmetic probe. The build must be an
// existing immutable artifact; all statically imported relative modules are
// checked against its artifact manifest before evaluation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] || '');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'inkwave-build.json'), 'utf8'));
const checked = new Set();
function verify(rel) {
  if (checked.has(rel)) return;
  assert.ok(!rel.startsWith('../') && !path.isAbsolute(rel));
  const bytes = fs.readFileSync(path.join(root, rel));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, manifest.artifacts[rel], `manifest: ${rel}`);
  checked.add(rel);
  const source = bytes.toString('utf8');
  const imports = /\b(?:import|export)(?:[^'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(imports)) {
    if (match[1].startsWith('.')) verify(path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[1])));
  }
}
verify('src/core/gyro.js');
globalThis.screen = { orientation: { angle: 0 } };
const { Gyro, gyroTurnDeg } = await import(pathToFileURL(path.join(root, 'src/core/gyro.js')));
const results = [];
for (const [sens, expected] of [[-5, 1], [0, 1.8], [5, 3]]) for (const hz of [30, 60, 120]) {
  const gyro = new Gyro(); gyro.sens = sens;
  for (let i = 0; i < 2 * hz; i++) gyro._sample(0, 0, Math.PI / 2, 1 / hz);
  const gain = gyro.dYaw / Math.PI;
  assert.ok(Math.abs(gain - expected) < 1e-9, `${sens}, ${hz} Hz: ${gain}`);
  results.push({ sens, hz, gain, deviceDegreesPer360: gyroTurnDeg(sens) });
}
console.log(JSON.stringify({ contentHash: manifest.contentHash, inputHash: manifest.inputHash,
  checkedArtifacts: [...checked].sort(), results }, null, 2));
