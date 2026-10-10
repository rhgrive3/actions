import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SITE = path.resolve(process.env.INKWAVE_STAGE_ASSET_SITE || path.join(ROOT, '_site'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function webpDimensions(bytes, label) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${label}: RIFF header`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${label}: WebP signature`);
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${label}: RIFF length`);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    assert.ok(payload + size <= bytes.length, `${label}: ${kind} chunk is truncated`);
    if (kind === 'VP8 ') {
      assert.ok(size >= 10, `${label}: VP8 frame header is truncated`);
      assert.equal(bytes.toString('hex', payload + 3, payload + 6), '9d012a', `${label}: VP8 key-frame marker`);
      return {
        width: bytes.readUInt16LE(payload + 6) & 0x3fff,
        height: bytes.readUInt16LE(payload + 8) & 0x3fff,
      };
    }
    if (kind === 'VP8L') {
      assert.ok(size >= 5, `${label}: VP8L frame header is truncated`);
      assert.equal(bytes[payload], 0x2f, `${label}: VP8L signature`);
      const b1 = bytes[payload + 1], b2 = bytes[payload + 2], b3 = bytes[payload + 3], b4 = bytes[payload + 4];
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
    if (kind === 'VP8X') {
      assert.ok(size >= 10, `${label}: VP8X frame header is truncated`);
      return {
        width: 1 + bytes.readUIntLE(payload + 4, 3),
        height: 1 + bytes.readUIntLE(payload + 7, 3),
      };
    }
    offset = payload + size + (size & 1);
  }
  assert.fail(`${label}: no WebP image frame found`);
}

test('Scorch stage menu URLs resolve to valid images in the emitted offline asset manifest', () => {
  const identityPath = path.join(SITE, 'inkwave-build.json');
  assert.ok(fs.existsSync(identityPath), `build output missing at ${SITE}; run scripts/build-inkwave.mjs first`);
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const revision = identity.build?.revision;
  assert.match(revision || '', /^[a-f0-9]{64}$/, 'build revision');
  const versionRoot = path.join(SITE, '_versions', revision);
  const menuModuleUrl = pathToFileURL(path.join(versionRoot, 'src', 'ui', 'menus.js'));
  const stageDirUrl = new URL('../../assets/stages/', menuModuleUrl);
  const manifestPath = fileURLToPath(new URL('manifest.json', stageDirUrl));
  const stageManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(stageManifest).filter(key => key !== 'generated').sort(), ['cargo', 'halyard', 'kelpline', 'scorch', 'tidewater']);
  assert.deepEqual(stageManifest.scorch, {
    day: { src:'assets/stages/scorch-day.webp', sm:'assets/stages/scorch-day-sm.webp' },
    dusk: { src:'assets/stages/scorch-dusk.webp', sm:'assets/stages/scorch-dusk-sm.webp' },
  });

  const worker = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
  const buildMatch = worker.match(/const BUILD\s*=\s*(\{[\s\S]*?\});/);
  assert.ok(buildMatch, 'emitted worker build configuration');
  const cacheManifest = JSON.parse(buildMatch[1]);
  assert.equal(cacheManifest.revision, revision, 'worker and emitted files use the same immutable revision');
  assert.ok(cacheManifest.precache.includes('assets/stages/manifest.json'), 'stage manifest is installed for offline use');

  for (const time of ['day', 'dusk']) for (const small of [false, true]) {
    const name = `scorch-${time}${small ? '-sm' : ''}.webp`;
    const url = new URL(name, stageDirUrl);
    const emittedPath = fileURLToPath(url);
    const relative = path.relative(SITE, emittedPath).split(path.sep).join('/');
    const cacheKey = path.relative(versionRoot, emittedPath).split(path.sep).join('/');
    assert.ok(relative.startsWith(`_versions/${revision}/assets/stages/`), `${name}: stage URL uses the immutable revision tree`);
    assert.ok(fs.existsSync(emittedPath), `${name}: emitted URL resolves`);
    const bytes = fs.readFileSync(emittedPath);
    const expectedSize = small ? [640, 360] : [1920, 1080];
    assert.deepEqual(webpDimensions(bytes, name), { width:expectedSize[0], height:expectedSize[1] }, `${name}: valid WebP dimensions`);
    assert.equal(identity.artifacts[relative], sha256(bytes), `${name}: included in the build artifact hash`);
    assert.deepEqual(cacheManifest.assets[cacheKey], [bytes.length, sha256(bytes)], `${name}: included in the offline worker asset allowlist`);
  }

  for (const name of ['range-day.webp', 'range-day-sm.webp']) {
    const relative = `assets/stages/${name}`;
    assert.ok(cacheManifest.assets[relative], `${name}: Practice Range art remains independently packaged`);
  }
  assert.ok(!stageManifest.range, 'Practice Range is not added to the match-stage manifest');
});
