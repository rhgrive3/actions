import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { optimizeLightmapPng, decodeGrayLightmap } from '../lib/inkwave-lossless-lightmap.mjs';

const known = Object.freeze({
  'cargo.png': '56de109b4c842372020605b718ef84bfbcb605fff2509ab8caf26fd3c1c0b874',
  'kelpline.png': '075078a8060ec375f046056c60eb31c84d11752fe9c8581df37d1cb9b5dfca80',
  'tidewater.png': '5e8df3f7fe18339d786f5d72bd91071bfdf03c4d3a676d5b71d792369a202ad2',
  'halyard.png': '5452532be3a23c4dd0383f2ad3ff54cf1554cc348c5cf378ca5633433ecb11ef',
});

test('production grayscale lightmaps keep independently Pillow-verified exact pixels while saving space', () => {
  let totalSaved = 0;
  for (const [name, checksum] of Object.entries(known)) {
    const source = fs.readFileSync(new URL('../../inkwave-public/assets/lightmaps/' + name, import.meta.url));
    const decoded = decodeGrayLightmap(source);
    assert.equal(crypto.createHash('sha256').update(decoded.pixels).digest('hex'), checksum, name + ' pinned input pixels');
    const optimized = optimizeLightmapPng(source);
    const again = decodeGrayLightmap(optimized);
    assert.equal(crypto.createHash('sha256').update(again.pixels).digest('hex'), checksum, name + ' optimized pixels');
    assert.equal(again.width, decoded.width);
    assert.equal(again.height, decoded.height);
    assert.ok(optimized.length < source.length, name + ' re-encoding must reduce bytes');
    totalSaved += source.length - optimized.length;
    assert.deepEqual(optimizeLightmapPng(optimized), optimized, name + ' repeat build is byte-stable');
  }
  assert.ok(totalSaved >= 20 * 1024, 'without losing offline data, saving must cover the precache overage');
});

test('lossless PNG optimization is fail-closed for unexpected bytes or bit-depth', () => {
  assert.throws(() => optimizeLightmapPng(Buffer.from('not a png')), /invalid PNG signature/);
  const good = fs.readFileSync(new URL('../../inkwave-public/assets/lightmaps/cargo.png', import.meta.url));
  const broken = Buffer.from(good);
  broken[broken.length - 6] ^= 1;
  assert.throws(() => optimizeLightmapPng(broken), /chunk checksum mismatch/);
});
