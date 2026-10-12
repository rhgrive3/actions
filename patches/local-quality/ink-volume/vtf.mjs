// VTF 7.0–7.2, one face/depth slice. Lossless decoding of the stored pixels;
// no alpha remapping, image processing or source mutation. Unsupported layouts fail.
export function decodeVTF(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 64 || v.getUint32(0, true) !== 0x00465456) throw Error('Invalid VTF signature');
  const major = v.getUint32(4, true), minor = v.getUint32(8, true), header = v.getUint32(12, true);
  const width = v.getUint16(16, true), height = v.getUint16(18, true), flags = v.getUint32(20, true);
  const count = v.getUint16(24, true), format = v.getUint32(52, true), mips = b[56];
  if (major !== 7 || minor > 2 || header < 64 || !width || !height || !count || !mips || (flags & 0x4000) || (minor >= 2 && v.getUint16(63, true) !== 1)) throw Error('Unsupported VTF layout/version');
  const size = (w, h, f) => {
    if (f === 0 || f === 12) return w * h * 4;
    if (f === 13) return Math.ceil(w / 4) * Math.ceil(h / 4) * 8;
    if (f === 14 || f === 15) return Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
    throw Error('Unsupported VTF pixel format ' + f);
  };
  let offset = header + (b[61] && b[62] ? size(b[61], b[62], v.getUint32(57, true)) : 0);
  for (let mip = mips - 1; mip > 0; mip--) offset += count * size(Math.max(1, width >> mip), Math.max(1, height >> mip), format);
  const frameBytes = size(width, height, format);
  if (offset + frameBytes * count > b.length) throw Error('Truncated VTF frame data');
  const frames = [];
  for (let frame = 0; frame < count; frame++) {
    const start = offset + frame * frameBytes, rgba = new Uint8Array(width * height * 4);
    if (format === 0 || format === 12) {
      rgba.set(b.subarray(start, start + frameBytes));
      if (format === 12) for (let p = 0; p < rgba.length; p += 4) [rgba[p], rgba[p + 2]] = [rgba[p + 2], rgba[p]];
    } else {
      const stride = format === 13 ? 8 : 16;
      for (let by = 0; by < Math.ceil(height / 4); by++) for (let bx = 0; bx < Math.ceil(width / 4); bx++) {
        const o = start + (by * Math.ceil(width / 4) + bx) * stride, co = o + (stride === 8 ? 0 : 8);
        const c0 = v.getUint16(co, true), c1 = v.getUint16(co + 2, true);
        const rgb = c => [Math.round((c >> 11) * 255 / 31), Math.round(((c >> 5) & 63) * 255 / 63), Math.round((c & 31) * 255 / 31)];
        const a = rgb(c0), c = rgb(c1), table = [a, c];
        if (format !== 13 || c0 > c1) table.push(a.map((x, k) => Math.floor((2 * x + c[k]) / 3)), a.map((x, k) => Math.floor((x + 2 * c[k]) / 3)));
        else table.push(a.map((x, k) => Math.floor((x + c[k]) / 2)), [0, 0, 0]);
        const codes = v.getUint32(co + 4, true), alphas = [b[o], b[o + 1]];
        if (format === 15) {
          if (alphas[0] > alphas[1]) for (let j = 1; j <= 6; j++) alphas.push(Math.floor(((7 - j) * alphas[0] + j * alphas[1]) / 7));
          else { for (let j = 1; j <= 4; j++) alphas.push(Math.floor(((5 - j) * alphas[0] + j * alphas[1]) / 5)); alphas.push(0, 255); }
        }
        for (let i = 0; i < 16; i++) {
          const x = bx * 4 + i % 4, y = by * 4 + (i >> 2); if (x >= width || y >= height) continue;
          const index = (codes >>> (i * 2)) & 3, p = (y * width + x) * 4;
          rgba.set(table[index], p);
          if (format === 13) rgba[p + 3] = c0 <= c1 && index === 3 ? 0 : 255;
          else if (format === 14) rgba[p + 3] = ((b[o + (i >> 1)] >>> ((i & 1) * 4)) & 15) * 17;
          else {
            const bit = i * 3, byte = o + 2 + (bit >> 3), shift = bit & 7;
            rgba[p + 3] = alphas[((b[byte] | ((b[byte + 1] || 0) << 8)) >>> shift) & 7];
          }
        }
      }
    }
    frames.push(rgba);
  }
  return { width, height, format, frames };
}
