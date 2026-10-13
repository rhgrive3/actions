import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
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

test('lossless PNG optimization preserves pixels from all five input row filters', () => {
  const width = 320, height = 100;
  const pixels = Buffer.alloc(width * height);
  const scanlines = Buffer.alloc((width + 1) * height);
  const paeth = (left, up, upperLeft) => {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left
      : upDistance <= upperLeftDistance ? up : upperLeft;
  };
  const predictor = (filter, left, up, upperLeft) => filter === 1 ? left : filter === 2 ? up
    : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixels[y * width + x] = (Math.floor(x / 19) * 23 + y * 7 + (x % 19) * 3) & 255;
  }
  const inputFilters = [];
  for (let y = 0; y < height; y++) {
    const filter = y % 5, row = y * width, scanline = y * (width + 1);
    inputFilters.push(filter);
    scanlines[scanline] = filter;
    for (let x = 0; x < width; x++) {
      const left = x ? pixels[row + x - 1] : 0;
      const up = y ? pixels[row - width + x] : 0;
      const upperLeft = y && x ? pixels[row - width + x - 1] : 0;
      scanlines[scanline + 1 + x] = (pixels[row + x] - predictor(filter, left, up, upperLeft)) & 255;
    }
  }
  const pngChunk = (type, payload) => {
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length, 0);
    chunk.write(type, 4, 'ascii');
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
    return chunk;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const firstMetadata = pngChunk('tEXt', Buffer.from('Description\0filter fixture'));
  const secondMetadata = pngChunk('pHYs', Buffer.from([0, 0, 14, 196, 0, 0, 14, 196, 1]));
  const original = Buffer.concat([signature, pngChunk('IHDR', ihdr), firstMetadata,
    pngChunk('IDAT', deflateSync(scanlines)), secondMetadata, pngChunk('IEND', Buffer.alloc(0))]);
  const compacted = optimizeLightmapPng(original);
  const before = decodeGrayLightmap(original), after = decodeGrayLightmap(compacted);
  assert.deepEqual([...new Set(inputFilters)], [0, 1, 2, 3, 4], 'fixture includes None, Sub, Up, Average and Paeth rows');
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert(after.ihdr.equals(before.ihdr), 'all image header metadata stays byte-identical');
  assert(after.pixels.equals(before.pixels), 'every decoded pixel remains identical');
  assert.deepEqual(after.chunks.filter(chunk => chunk.kind !== 'IDAT').map(chunk => chunk.bytes),
    before.chunks.filter(chunk => chunk.kind !== 'IDAT').map(chunk => chunk.bytes), 'all non-IDAT chunk bytes remain identical');
  assert(compacted.length <= original.length, 'lossless re-encoding never grows the fixture');
});
