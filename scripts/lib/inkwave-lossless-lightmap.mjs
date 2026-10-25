// Build-only, dependency-free PNG8 grayscale lossless re-encoder.
// Lightmaps remain fully precached. Source assets are never rewritten.
// PNG row predictors and zlib are defined by the PNG specification.
import * as zlib from 'node:zlib';
const { inflateSync, deflateSync } = zlib;

const makeCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  return table;
};
const CRC_TABLE = makeCrcTable();
export const crc32 = zlib.crc32 || function(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const paeth = (a, b, c) => {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
};
const pngChunk = (kind, payload) => {
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write(kind, 4, 'ascii');
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  return chunk;
};

export function decodeGrayLightmap(source) {
  if (!Buffer.isBuffer(source) || !source.subarray(0, 8).equals(SIGNATURE)) throw Error('lightmap: invalid PNG signature');
  let ihdr = null, idats = [], chunks = [], ended = false;
  for (let offset = 8; offset < source.length;) {
    if (offset + 12 > source.length) throw Error('lightmap: incomplete PNG chunk');
    const len = source.readUInt32BE(offset);
    const kind = source.toString('ascii', offset + 4, offset + 8);
    if (offset + 12 + len > source.length) throw Error('lightmap: truncated PNG chunk');
    const payload = source.subarray(offset + 8, offset + 8 + len);
    const bytes = source.subarray(offset, offset + 12 + len);
    if (crc32(source.subarray(offset + 4, offset + 8 + len)) !== source.readUInt32BE(offset + 8 + len))
      throw Error('lightmap: chunk checksum mismatch');
    if (kind === 'IHDR') ihdr = Buffer.from(payload);
    else if (kind === 'IDAT') idats.push(payload);
    else if (kind === 'IEND') { chunks.push({ kind, bytes }); ended = true; break; }
    else if (!['PLTE'].includes(kind) && (kind.charCodeAt(0) & 0x20) === 0)
      throw Error('lightmap: unsupported critical PNG chunk ' + kind);
    chunks.push({ kind, bytes });
    offset += 12 + len;
  }
  if (!ended || !ihdr || ihdr.length !== 13 || ihdr[8] !== 8 || ihdr[9] !== 0 ||
    ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0 || !idats.length)
    throw Error('lightmap: expected non-interlaced 8-bit grayscale PNG');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  if (!(width > 0 && width <= 4096 && height > 0 && height <= 4096))
    throw Error('lightmap: unsupported dimensions');
  const packed = inflateSync(Buffer.concat(idats));
  if (packed.length !== (width + 1) * height) throw Error('lightmap: decoded size mismatch');
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    const method = packed[y * (width + 1)], row = y * width;
    if (method > 4) throw Error('lightmap: unsupported row filter');
    const input = y * (width + 1) + 1;
    // PNG None already stores the exact bytes; Up needs only the previous
    // row, with no left/Paeth predictor work. Keep first-row Up on the generic
    // path, where its absent previous row is defined as zero.
    if (method === 0) { packed.copy(pixels, row, input, input + width); continue; }
    if (method === 2 && y) {
      for (let x = 0; x < width; x++) pixels[row + x] = (packed[input + x] + pixels[row - width + x]) & 255;
      continue;
    }
    for (let x = 0; x < width; x++) {
      const left = x ? pixels[row + x - 1] : 0;
      const above = y ? pixels[row - width + x] : 0;
      const aboveLeft = y && x ? pixels[row - width + x - 1] : 0;
      const pred = method === 0 ? 0 : method === 1 ? left : method === 2 ? above :
        method === 3 ? ((left + above) >> 1) : paeth(left, above, aboveLeft);
      pixels[row + x] = (packed[input + x] + pred) & 255;
    }
  }
  return { ihdr, pixels, width, height, chunks };
}

export function optimizeLightmapPng(source) {
  const { ihdr, pixels, width, height, chunks } = decodeGrayLightmap(source);
  const filtered = Buffer.alloc((width + 1) * height);
  // Each candidate overwrites its whole row before it can win. Swap two
  // scratch rows instead of allocating five new buffers per image row.
  let bytes = Buffer.allocUnsafe(width), best = Buffer.allocUnsafe(width);
  for (let y = 0; y < height; y++) {
    const row = y * width, out = y * (width + 1);
    let smallest = Infinity, bestFilter = 0;
    for (let method = 0; method <= 4; method++) {
      let score = 0;
      for (let x = 0; x < width; x++) {
        const left = x ? pixels[row + x - 1] : 0;
        const above = y ? pixels[row - width + x] : 0;
        const aboveLeft = y && x ? pixels[row - width + x - 1] : 0;
        const pred = method === 0 ? 0 : method === 1 ? left : method === 2 ? above :
          method === 3 ? ((left + above) >> 1) : paeth(left, above, aboveLeft);
        const value = (pixels[row + x] - pred) & 255;
        bytes[x] = value;
        score += value < 128 ? value : 256 - value;
        // Scores only increase, and ties retain the earlier filter. A losing
        // partial row can never replace best, so its remaining bytes are unused.
        if (score >= smallest) break;
      }
      if (score < smallest) {
        smallest = score; bestFilter = method;
        const previous = best; best = bytes; bytes = previous;
      }
    }
    filtered[out] = bestFilter;
    best.copy(filtered, out + 1);
  }
  const deflated = deflateSync(filtered, { level: 9 });
  const encodedIdat = pngChunk('IDAT', deflated);
  let insertedIdat = false;
  const resultChunks = chunks.flatMap(chunk => {
    if (chunk.kind !== 'IDAT') return [chunk.bytes];
    if (insertedIdat) return [];
    insertedIdat = true;
    return [encodedIdat];
  });
  const result = Buffer.concat([SIGNATURE, ...resultChunks]);
  const roundTrip = decodeGrayLightmap(result);
  if (!roundTrip.pixels.equals(pixels) || !roundTrip.ihdr.equals(ihdr)) throw Error('lightmap: lossless round-trip failed');
  return result.length < source.length ? result : source;
}
