import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {admitPrebuiltTextures, prebuiltConverterIdentity} from '../lib/inkwave-native-prebuilt.mjs';
import {PREBUILT_SCHEMA} from '../../patches/native-stages/runtime/prebuilt-format.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fixture({tools = true, source = 'src-sha', staleConverter = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iw-prebuilt-tex-'));
  const color = Buffer.from('COLORPACK-0123456789'), detail = Buffer.from('DETAILPACK-abcdef');
  fs.mkdirSync(path.join(root, 'packs')); fs.mkdirSync(path.join(root, 'stage'));
  fs.writeFileSync(path.join(root, 'packs/c.bin'), color); fs.writeFileSync(path.join(root, 'packs/d.bin'), detail);
  const identity = prebuiltConverterIdentity(), files = {...identity.files};
  if (staleConverter) files['patches/native-stages/runtime/source-convert.mjs'] = 'stale';
  if (!tools) files['patches/native-stages/tools/prebuild_textures.py'] = 'other';
  const record = {schema: PREBUILT_SCHEMA, id: 'stage', sourceSha256: source, converter: {files, sha256: 'x'}, arrays: {},
    manifest: {prebuiltTexturePacks: [{file: 'packs/c.bin', group: 'color', bytes: color.length, sha256: sha(color)},
      {file: 'packs/d.bin', group: 'detail', bytes: detail.length, sha256: sha(detail)}],
    prebuiltTextures: {'a.png': {albedo: {pack: 'packs/c.bin', offset: 0, bytes: 5, width: 4, height: 4}},
      'n.png': {normal: {pack: 'packs/d.bin', offset: 0, bytes: 5, width: 4, height: 4}},
      'bad.png': {albedo: {pack: 'packs/c.bin', offset: 18, bytes: 9, width: 4, height: 4}}}}};
  fs.writeFileSync(path.join(root, 'stage/stage.json'), JSON.stringify(record));
  return root;
}

test('a stale geometry record still offers its verified colour textures only', () => {
  const root = fixture();
  const {textures} = admitPrebuiltTextures([{id: 'stage', sourceSha256: 'src-sha'}], new Set(), root);
  const t = textures.stage;
  assert.ok(t, 'texture-only stage admitted');
  const table = JSON.parse(t.json);
  assert.deepEqual(Object.keys(table.prebuiltTextures), ['a.png'], 'detail maps and out-of-pack slices are dropped');
  assert.deepEqual(table.prebuiltTexturePacks.map(p => p.file), ['packs/c.bin']);
  assert.equal(t.sha256, sha(t.json)); assert.equal(t.bytes, t.json.length);
  assert.deepEqual(t.packs, ['packs/c.bin']);
});

test('texture tools, source pin, admitted full records and pack integrity gate the table', () => {
  assert.deepEqual(admitPrebuiltTextures([{id: 'stage', sourceSha256: 'src-sha'}], new Set(), fixture({tools: false})).textures, {});
  assert.deepEqual(admitPrebuiltTextures([{id: 'stage', sourceSha256: 'other'}], new Set(), fixture()).textures, {});
  assert.deepEqual(admitPrebuiltTextures([{id: 'stage', sourceSha256: 'src-sha'}], new Set(['stage']), fixture()).textures, {});
  const root = fixture(); fs.writeFileSync(path.join(root, 'packs/c.bin'), 'tampered');
  assert.deepEqual(admitPrebuiltTextures([{id: 'stage', sourceSha256: 'src-sha'}], new Set(), root).textures, {});
  const pointer = fixture(); fs.writeFileSync(path.join(pointer, 'stage/stage.json'), 'version https://git-lfs.github.com/spec/v1\noid sha256:00\n');
  assert.deepEqual(admitPrebuiltTextures([{id: 'stage', sourceSha256: 'src-sha'}], new Set(), pointer).textures, {});
});
