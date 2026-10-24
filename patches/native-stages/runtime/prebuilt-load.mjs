// Load a prebuilt native stage (native-prebuilt/<id>/stage.json) produced by
// tools/prebuild-native.mjs: the same browser-direct conversion, verified
// chunk by chunk. Returns the object source-worker.mjs would post.
import {nativeStageBuild} from './build-config.mjs';
import {PREBUILT_SCHEMA, unpackFaces} from './prebuilt-format.mjs';

const TYPES = {Float32Array, Float64Array, Uint32Array, Int32Array, Uint8Array};
const hex = b => Array.from(new Uint8Array(b), v => v.toString(16).padStart(2, '0')).join('');
const FACE_ARRAYS = ['faceF64', 'faceI32', 'faceTriangleOffsets', 'faceTriangles'];

export function prebuiltEntry(id) {
  return nativeStageBuild?.prebuilt?.stages?.[id] || null;
}
export function prebuiltURL(file) {
  return new URL(nativeStageBuild.prebuilt.baseURL + file, globalThis.document?.baseURI || globalThis.location?.href).href;
}
export async function fetchVerified(file, expected, signal) {
  const response = await fetch(prebuiltURL(file), {signal});
  if (!response.ok) throw Error('Prebuilt asset ' + response.status + ': ' + file);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== expected.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== expected.sha256)
    throw Error('Prebuilt integrity mismatch: ' + file);
  return bytes;
}

async function loadArray(id, spec, signal) {
  const Type = TYPES[spec.type];
  if (!Type) throw Error('Unknown prebuilt array type: ' + spec.type);
  const total = spec.chunks.reduce((n, c) => n + c.bytes, 0);
  if (total !== spec.length * Type.BYTES_PER_ELEMENT) throw Error('Prebuilt array size mismatch');
  const buffer = new ArrayBuffer(total);
  let offset = 0;
  // Sequential chunks bound the peak to one chunk plus the final array.
  for (const chunk of spec.chunks) {
    new Uint8Array(buffer, offset, chunk.bytes).set(new Uint8Array(await fetchVerified(id + '/' + chunk.file, chunk, signal)));
    offset += chunk.bytes;
  }
  return new Type(buffer);
}

export async function loadPrebuiltSource(id, signal) {
  const entry = prebuiltEntry(id);
  if (!entry) throw Error('No prebuilt stage: ' + id);
  const progress = phase => globalThis.dispatchEvent?.(new CustomEvent('inkwave:native-source-progress', {detail: {id, phase}}));
  progress('download');
  const record = JSON.parse(new TextDecoder().decode(await fetchVerified(id + '/stage.json', {bytes: entry.bytes, sha256: entry.stageSha256}, signal)));
  if (record.schema !== PREBUILT_SCHEMA || record.id !== id) throw Error('Unsupported prebuilt stage: ' + id);
  const data = {...record.extra, manifest: record.manifest};
  for (const [name, spec] of Object.entries(record.arrays)) data[name] = await loadArray(id, spec, signal);
  if (data.faceF64) {
    data.manifest.faces = unpackFaces(data.faceF64, data.faceI32, data.faceTriangleOffsets, data.faceTriangles);
    for (const name of FACE_ARRAYS) delete data[name];
  }
  if (data.manifest.faces?.length !== data.manifest.prebuiltFaces) throw Error('Prebuilt paint faces incomplete: ' + id);
  data.sourceMetrics = {cached: false, prebuilt: true, recipe: record.sourceRecipe};
  progress('ready');
  return data;
}
