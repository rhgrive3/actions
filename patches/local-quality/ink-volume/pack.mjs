// Resolve beside this module, including subdirectory and immutable-revision
// hosting. Both original source-derived packs ship and load on ordinary boot.
export const DEFAULT_INK_VOLUME_URLS = Object.freeze({
  roller: new URL('./assets/roller/manifest.json', import.meta.url).href,
  shooter: new URL('./assets/shooter/manifest.json', import.meta.url).href,
});
// Binary views stay backed by the single fetched buffer. No base64 in gameplay.
export function unpackVolumes(manifest, buffer) {
  if (manifest.schema !== 'inkwave-volume-v1' || !(buffer instanceof ArrayBuffer) || buffer.byteLength > 128 * 1024 * 1024 || buffer.byteLength !== manifest.byteLength || !Array.isArray(manifest.patterns) || manifest.patterns.length > 8) throw Error('Invalid volume binary');
  const view = (entry, Type) => {
    if (!entry || !Number.isInteger(entry.offset) || !Number.isInteger(entry.length) || entry.offset < 0 || entry.length < 0 || entry.offset % Type.BYTES_PER_ELEMENT || entry.offset + entry.length * Type.BYTES_PER_ELEMENT > buffer.byteLength) throw Error('Invalid volume buffer range');
    return new Type(buffer, entry.offset, entry.length);
  };
  const indices=(l,key)=>view(l[key],l.indexBytes===2?Uint16Array:l.indexBytes===4?Uint32Array:(()=>{throw Error('Invalid index format');})());
  return { schema: manifest.schema, patterns: manifest.patterns.map(p => ({ width: p.width, height: p.height, meshAspect:p.meshAspect, fps: p.fps, frames: p.frames.map(f => ({ rgba: view(f.rgba, Uint8Array), levels: f.levels.map(l => ({ positions: view(l.positions, Float32Array), normals: view(l.normals, l.normalBytes===2?Int16Array:l.normalBytes===undefined||l.normalBytes===4?Float32Array:(()=>{throw Error('Invalid normal format');})()), uvs: view(l.uvs, Float32Array), indices: indices(l,'indices'), ...(l.opaqueIndices||l.fringeIndices ? {opaqueIndices:indices(l,'opaqueIndices'),fringeIndices:indices(l,'fringeIndices')}: {}) })) })) })) };
}
// Lossless gzip changes transport bytes only. The checksum is always checked
// against the original uncompressed pack, including every RGBA/geometry byte.
export async function decodeVolumeBinary(manifest, data) {
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength < 0 || manifest.byteLength > 128 * 1024 * 1024) throw Error('Invalid volume size');
  if (!manifest.compression) return data;
  if (manifest.compression !== 'gzip' || typeof DecompressionStream !== 'function') throw Error('Unsupported ink compression');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip')), reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > manifest.byteLength) throw Error('Ink decompression exceeds declared size');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (length !== manifest.byteLength) throw Error('Ink decompression length mismatch');
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}
export async function loadVolumePack(url, { signal } = {}) {
  const response = await fetch(url, { signal }); if (!response.ok) throw Error('Ink pack HTTP ' + response.status);
  const manifest = await response.json();
  const binaryURL = new URL(manifest.binary, response.url);
  if (binaryURL.origin !== new URL(response.url).origin) throw Error('Ink binary must share the manifest origin');
  if (typeof manifest.binarySHA256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.binarySHA256)) throw Error('Missing ink binary checksum');
  // Two bundled packs use a bounded, content-addressed cache independent of
  // the existing 10 MiB startup snapshot. A later offline launch can reuse them
  // without redownloading or keeping a second copy for every code revision.
  const slot = ['roller','shooter'].includes(manifest.cacheSlot) ? manifest.cacheSlot : null;
  const key = slot ? new URL('/__inkwave_volume_cache__/' + slot + '/' + manifest.binarySHA256, response.url).href : null;
  let cache, cached;
  if (key && typeof caches !== 'undefined') try { cache = await caches.open('inkwave-ink-volume-v1'); cached = await cache.match(key); } catch { /* storage unavailable: normal fetch */ }
  let transported;
  const read = async data => {
    if (!data.ok) throw Error('Ink binary HTTP ' + data.status);
    transported = await data.arrayBuffer();
    if ((manifest.compression || slot) && transported.byteLength > 20 * 1024 * 1024) throw Error('Ink transport exceeds cache budget');
    const buffer = await decodeVolumeBinary(manifest, transported);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hex = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    if (hex !== manifest.binarySHA256) throw Error('Ink binary checksum mismatch');
    return unpackVolumes(manifest, buffer);
  };
  let pack;
  if (cached) try { pack = await read(cached); } catch {
    await cache.delete(key).catch(() => {}); cached = null;
  }
  if (!pack) pack = await read(await fetch(binaryURL, { signal }));
  if (cache && !cached) try {
    await cache.put(key, new Response(transported));
    const prefix = new URL('/__inkwave_volume_cache__/' + slot + '/', response.url).href;
    for (const request of await cache.keys()) if (request.url.startsWith(prefix) && request.url !== key) await cache.delete(request);
  } catch { /* a quota failure must not discard a verified, usable pack */ }
  return pack;
}
