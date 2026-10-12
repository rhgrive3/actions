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
export async function loadVolumePack(url, { signal } = {}) {
  const response = await fetch(url, { signal }); if (!response.ok) throw Error('Ink pack HTTP ' + response.status);
  const manifest = await response.json();
  const binaryURL = new URL(manifest.binary, response.url);
  if (binaryURL.origin !== new URL(response.url).origin) throw Error('Ink binary must share the manifest origin');
  const data = await fetch(binaryURL, { signal }); if (!data.ok) throw Error('Ink binary HTTP ' + data.status);
  const buffer = await data.arrayBuffer();
  if (typeof manifest.binarySHA256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.binarySHA256)) throw Error('Missing ink binary checksum');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  if (hex !== manifest.binarySHA256) throw Error('Ink binary checksum mismatch');
  return unpackVolumes(manifest, buffer);
}
