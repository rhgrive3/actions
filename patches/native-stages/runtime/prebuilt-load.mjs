// Load a prebuilt native stage (native-prebuilt/<id>/stage.json) produced by
// tools/prebuild-native.mjs: the same browser-direct conversion, verified
// chunk by chunk. Returns the object source-worker.mjs would post.
import {nativeStageBuild} from './build-config.mjs';
import {PREBUILT_SCHEMA, unpackFacesAsync} from './prebuilt-format.mjs';

const TYPES = {Float32Array, Float64Array, Uint32Array, Int32Array, Uint8Array};
const hex = b => Array.from(new Uint8Array(b), v => v.toString(16).padStart(2, '0')).join('');
const FACE_ARRAYS = ['faceF64', 'faceI32', 'faceTriangleOffsets', 'faceTriangles'];
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Aborted','AbortError');}

export function prebuiltEntry(id) {
  return nativeStageBuild?.prebuilt?.stages?.[id] || null;
}
export function prebuiltURL(file) {
  return new URL(nativeStageBuild.prebuilt.baseURL + file, globalThis.document?.baseURI || globalThis.location?.href).href;
}
export async function fetchVerified(file, expected, signal) {
  checkAbort(signal);
  const response = await fetch(prebuiltURL(file), {signal});
  if (!response.ok) throw Error('Prebuilt asset ' + response.status + ': ' + file);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== expected.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== expected.sha256)
    throw Error('Prebuilt integrity mismatch: ' + file);
  checkAbort(signal);
  return bytes;
}

// Stream into an unpublished final-array range, then authenticate that range.
// A failed length/hash never exposes partially trusted data to a stage owner.
export async function fetchVerifiedInto(file,expected,signal,target){
 checkAbort(signal);
 if(target.byteLength!==expected.bytes)throw Error('Prebuilt target size mismatch');
 const response=await fetch(prebuiltURL(file),{signal});
 if(!response.ok)throw Error('Prebuilt asset '+response.status+': '+file);
 const reader=response.body?.getReader?.();
 if(reader){let offset=0;try{while(true){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const {done,value}=await reader.read();if(done)break;
  if(offset+value.byteLength>target.byteLength)throw Error('Prebuilt integrity mismatch: '+file);
  target.set(value,offset);offset+=value.byteLength;
 }if(offset!==target.byteLength)throw Error('Prebuilt integrity mismatch: '+file);
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}
 else {const bytes=await response.arrayBuffer();if(bytes.byteLength!==target.byteLength)throw Error('Prebuilt integrity mismatch: '+file);target.set(new Uint8Array(bytes));}
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(hex(await crypto.subtle.digest('SHA-256',target))!==expected.sha256)throw Error('Prebuilt integrity mismatch: '+file);
 checkAbort(signal);
}

async function loadArray(id, spec, signal) {
  const Type = Object.hasOwn(TYPES,spec.type)?TYPES[spec.type]:null;
  if (!Type) throw Error('Unknown prebuilt array type: ' + spec.type);
  const total = spec.chunks.reduce((n, c) => n + c.bytes, 0);
  if (total !== spec.length * Type.BYTES_PER_ELEMENT) throw Error('Prebuilt array size mismatch');
  const buffer = new ArrayBuffer(total);
  let offset = 0;
  // Sequential chunks bound the peak to one chunk plus the final array.
  for (const chunk of spec.chunks) {
    await fetchVerifiedInto(id + '/' + chunk.file,chunk,signal,new Uint8Array(buffer,offset,chunk.bytes));
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
  const entries=Object.entries(record.arrays),smallBudget=8*1024*1024;
  const peakChunk=spec=>spec.chunks.reduce((max,chunk)=>Math.max(max,chunk.bytes),0);
  for(let at=0;at<entries.length;){
    const wave=[entries[at++]];let bytes=peakChunk(wave[0][1]);
    if(at<entries.length&&bytes+peakChunk(entries[at][1])<=smallBudget)wave.push(entries[at++]);
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
    if(signal?.aborted)abort();else signal?.addEventListener?.('abort',abort,{once:true});
    let firstError;
    try{
      const results=await Promise.allSettled(wave.map(async([,spec])=>{
        try{return await loadArray(id,spec,controller.signal);}catch(error){firstError??=error;controller.abort(error);throw error;}
      }));
      const failed=results.find(row=>row.status==='rejected');if(failed)throw firstError||failed.reason;
      for(let i=0;i<wave.length;i++)data[wave[i][0]]=results[i].value;
    }finally{signal?.removeEventListener?.('abort',abort);}
  }
  if (data.faceF64) {
    data.manifest.faces = await unpackFacesAsync(data.faceF64, data.faceI32, data.faceTriangleOffsets, data.faceTriangles,{signal});
    for (const name of FACE_ARRAYS) delete data[name];
  }
  if (data.manifest.faces?.length !== data.manifest.prebuiltFaces) throw Error('Prebuilt paint faces incomplete: ' + id);
  data.sourceMetrics = {cached: false, prebuilt: true, recipe: record.sourceRecipe};
  progress('ready');
  return data;
}
