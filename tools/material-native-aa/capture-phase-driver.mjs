// Exact-input, future-only diagnostic markers. Never changes runtime or accepts partial evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const INPUT_SHA256='c2c0898e81583b2fbb0b8b1f6ca0cff990efcb38bbcbbf020eb9eb0520352096';
export const sha256=source=>createHash('sha256').update(source).digest('hex');
export const OLD=`  const image=label=>{
   const before=diagnostic?snapshotRenderState():null;
   const c=g.R.composer,read=c?.readBuffer,write=c?.writeBuffer;
   try{g.R.render();const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
   finally{let afterRender=null;try{if(diagnostic)afterRender=snapshotRenderState();}finally{if(c){c.readBuffer=read;c.writeBuffer=write;}}if(diagnostic)renderStates.push({label,captureOrdinal:renderStates.length,before,afterRender,after:snapshotRenderState()});}
  };`;
export const NEW=`  const image=label=>{
   const captureSnapshot=stage=>{checkpoint('capture-snapshot-start',{label,captureOrdinal:renderStates.length,stage});const value=snapshotRenderState();checkpoint('capture-snapshot-end',{label,captureOrdinal:renderStates.length,stage});return value;};
   const before=diagnostic?captureSnapshot('before'):null;
   const c=g.R.composer,read=c?.readBuffer,write=c?.writeBuffer;
   try{g.R.render();const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);checkpoint('capture-readpixels-start',{label,captureOrdinal:renderStates.length});gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);checkpoint('capture-readpixels-end',{label,captureOrdinal:renderStates.length});return p;}
   finally{let afterRender=null;try{if(diagnostic)afterRender=captureSnapshot('afterRender');}finally{if(c){c.readBuffer=read;c.writeBuffer=write;}}if(diagnostic)renderStates.push({label,captureOrdinal:renderStates.length,before,afterRender,after:captureSnapshot('after')});}
  };`;
export const NORMALIZED_INPUT_SHA256='9877acf98a2e176a5e6ac04418bacd954a06049cde60f7686df486273aa39255';
export function normalizeFrame(source,imports){
 assert.deepEqual(imports.map(x=>x.specifier).sort(),['./lib/inkwave-range-menu-entry.mjs','./lib/inkwave-runtime-evidence.mjs','playwright']);
 for(const {specifier,url} of imports){assert.equal(new URL(url).protocol,'file:');const needle='from '+JSON.stringify(url);assert.equal(source.split(needle).length,2,'unique reviewed import');source=source.replace(needle,"from '"+specifier+"'");}
 return source;
}
export function prepareCapturePhases(source,imports){
 assert.equal(sha256(imports?normalizeFrame(source,imports):source),imports?NORMALIZED_INPUT_SHA256:INPUT_SHA256,'exact retained6469 generated frame input');assert.equal(source.split(OLD).length,2,'unique unchanged image transaction');
 const program=source.replace(OLD,NEW);
 return{program,provenance:{schema:1,diagnosticOnly:true,performanceAccepted:false,preMarkerFrameSha256:sha256(source),normalizedInputSha256:NORMALIZED_INPUT_SHA256,generatedFrameSha256:sha256(program),scope:'scalar phase markers only; no completed-capture guarantee',newAwaits:0,newRenders:0,newReadPixels:0}};
}
export function inverse(program){assert.equal(program.split(NEW).length,2);return program.replace(NEW,OLD);}
export function extendPreparedCapturePhases(prepared){
 assert.equal(sha256(prepared.program),prepared.provenance.generatedFrameSha256,'actual pre-marker generated frame');
 const marked=prepareCapturePhases(prepared.program,prepared.provenance.imports);
 return{...prepared,program:marked.program,provenance:{...prepared.provenance,generatedFrameSha256:marked.provenance.generatedFrameSha256,capturePhases:marked.provenance}};
}
