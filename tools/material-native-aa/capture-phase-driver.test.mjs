import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {prepareCapturePhases,inverse,OLD,NEW,sha256} from './capture-phase-driver.mjs';
import {retainedFrame as original,retainedImports} from './diagnostic-fixture.mjs';
const candidate=prepareCapturePhases(original);
test('exact input, inverse and no modification outside image transaction',()=>{assert.equal(inverse(candidate.program),original);assert.equal(candidate.program.replace(NEW,''),original.replace(OLD,''));assert.equal(sha256(candidate.program),candidate.provenance.generatedFrameSha256);assert.throws(()=>prepareCapturePhases(original+'\n'));});
test('unchanged native operations, awaits, timers and gate source',()=>{
 for(const pattern of [/gl\.readPixels\(/g,/g\.R\.render\(/g,/await /g,/setTimeout\(/g,/gl\.finish\(/g,/readRenderTargetPixels\(/g])assert.equal(candidate.program.match(pattern)?.length,original.match(pattern)?.length);
 for(const marker of ["if(paintSignal.changed<=1000||repeatSignal.changed!==0)","window.__materialRequirePostprocess(renderState[phase].entryObservation.postprocess)","if(diagnostic&&!entryReadiness.passed)","viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight]"])assert.ok(candidate.program.includes(marker));
});
function execute(body,{diagnostic=true,fail=null,composer=true}={}){
 let n=0;const events=[],phases=[],states=[],read={tag:'read'},write={tag:'write'},c={readBuffer:read,writeBuffer:write};
 const snapshotRenderState=()=>{events.push('snapshot'+n);if(fail==='snapshot'+n++){throw Error(fail);}return{ordinal:n,read:c.readBuffer.tag,write:c.writeBuffer.tag,owner:{strict:42}};};
 const g={R:{composer:composer?c:null,render(){events.push('render');if(composer){c.readBuffer=write;c.writeBuffer=read;}if(fail==='render')throw Error(fail);}}};
 const gl={drawingBufferWidth:960,drawingBufferHeight:600,RGBA:1,UNSIGNED_BYTE:2,readPixels(x,y,w,h,f,t,p){events.push('readPixels');assert.deepEqual([x,y,w,h,f,t],[0,0,960,600,1,2]);if(fail==='readPixels')throw Error(fail);for(let i=0;i<p.length;i++)p[i]=i%251;}};
 const checkpoint=(phase,detail)=>phases.push({phase,...detail});
 const image=Function('diagnostic','snapshotRenderState','g','gl','renderStates','checkpoint',body+';return image;')(diagnostic,snapshotRenderState,g,gl,states,checkpoint);
 const pixels=[];let error;try{for(const label of ['unpainted','painted','repeat','repeat2'])pixels.push(sha256(image(label)));}catch(e){error=e.message;}
 return{events,phases,states,pixels,error,read:c.readBuffer.tag,write:c.writeBuffer.tag};
}
for(const opts of [{},{diagnostic:false},{composer:false},...['render','readPixels','snapshot0','snapshot1','snapshot2'].map(fail=>({fail}))])test('actual extracted image operations and failure semantics '+JSON.stringify(opts),()=>{
 const a=execute(OLD,opts),b=execute(NEW,opts);const{phases,...rest}=b;assert.deepEqual(rest,(({phases,...r})=>r)(a));assert.ok(phases.every(p=>JSON.stringify(p).length<160));
 if(opts.fail==='readPixels'){assert.ok(phases.some(p=>p.phase==='capture-readpixels-start'));assert.equal(phases.some(p=>p.phase==='capture-readpixels-end'),false);assert.ok(phases.some(p=>p.phase==='capture-snapshot-end'&&p.phase!==undefined&&p.label==='unpainted'));}
});
test('four captures have exact ordered start/end markers and original 12 snapshots',()=>{
 const b=execute(NEW);assert.equal(b.events.filter(x=>x.startsWith('snapshot')).length,12);assert.equal(b.events.filter(x=>x==='render').length,4);assert.equal(b.events.filter(x=>x==='readPixels').length,4);
 // The snapshot stage is carried by detail.stage so it cannot overwrite the transport phase key.
 assert.equal(b.phases.length,32);
 const labels=['unpainted','painted','repeat','repeat2'];
 for(let ordinal=0;ordinal<4;ordinal++)assert.deepEqual(b.phases.slice(ordinal*8,ordinal*8+8),[
  {phase:'capture-snapshot-start',label:labels[ordinal],captureOrdinal:ordinal,stage:'before'},
  {phase:'capture-snapshot-end',label:labels[ordinal],captureOrdinal:ordinal,stage:'before'},
  {phase:'capture-readpixels-start',label:labels[ordinal],captureOrdinal:ordinal},
  {phase:'capture-readpixels-end',label:labels[ordinal],captureOrdinal:ordinal},
  {phase:'capture-snapshot-start',label:labels[ordinal],captureOrdinal:ordinal,stage:'afterRender'},
  {phase:'capture-snapshot-end',label:labels[ordinal],captureOrdinal:ordinal,stage:'afterRender'},
  {phase:'capture-snapshot-start',label:labels[ordinal],captureOrdinal:ordinal,stage:'after'},
  {phase:'capture-snapshot-end',label:labels[ordinal],captureOrdinal:ordinal,stage:'after'}]);
});

test('actual checkpoint encoding retains phase and no snapshot/pixel payload',()=>{
 const logs=[],performance={now:()=>12.5},console={log:x=>logs.push(x)},diagnostic=true;
 const checkpoint=(phase,detail={})=>{if(diagnostic)console.log('MATERIAL_PHASE '+JSON.stringify({phase,time:performance.now(),...detail}));};
 for(const p of execute(NEW).phases){const{phase,...detail}=p;checkpoint(phase,detail);}
 for(const line of logs){const p=JSON.parse(line.slice(15));assert.match(p.phase,/^capture-(snapshot|readpixels)-(start|end)$/);assert.equal(p.time,12.5);assert.ok(line.length<200);assert.equal('rgba' in p,false);assert.equal('owner' in p,false);}
});
test('generator integration preserves inherited provenance and binds new body',async()=>{
 const{extendPreparedCapturePhases}=await import('./capture-phase-driver.mjs');
 const p={program:original,provenance:{generatedFrameSha256:sha256(original),imports:retainedImports,postprocessOwners:{retained:true}}};const before=JSON.stringify(p),r=extendPreparedCapturePhases(p);
 assert.equal(JSON.stringify(p),before);assert.deepEqual(r.provenance.imports,p.provenance.imports);assert.deepEqual(r.provenance.postprocessOwners,p.provenance.postprocessOwners);assert.equal(r.provenance.generatedFrameSha256,sha256(r.program));assert.equal(r.provenance.capturePhases.preMarkerFrameSha256,sha256(original));assert.throws(()=>extendPreparedCapturePhases({...p,provenance:{...p.provenance,generatedFrameSha256:'wrong'}}));
});
