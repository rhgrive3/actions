import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCaptureEvaluator,withCaptureRestoration,collectCaptureModes} from '../lib/inkwave-capture-evidence.mjs';
import {collectVisibilityEvidence,visibilityVerdict} from '../lib/inkwave-visibility-sequence.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=','base64');
const raw=Buffer.from([12,34,56,78]);
const snapshot=()=>({mode:'baseline',width:1,height:1,orientation:'bottom-up',format:'RGBA8',png:'data:image/png;base64,'+png.toString('base64'),rawRGBA:raw.toString('base64'),error:'original mismatch',channelMax:[1,2,3,4]});
function fixture(t,writeFile){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'capture-persistence-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
 let saved=snapshot();const errors=[];
 const page={evaluate:async fn=>{if(fn==='capture'){saved=snapshot();throw Error('original mismatch');}if(fn==='restore-before-capture')throw Error('early restore error');const previous=globalThis.__nativeCanvasCaptureFailure;globalThis.__nativeCanvasCaptureFailure=saved;try{return fn();}finally{saved=globalThis.__nativeCanvasCaptureFailure;globalThis.__nativeCanvasCaptureFailure=previous;}}};
 return {out,errors,clear:()=>{saved=null;},capture:createCaptureEvaluator({page,out,onPersistenceError:e=>errors.push(e),...(writeFile?{writeFile}: {})})};
}
test('caller persists exact PNG/raw before successful restoration clears snapshot and rethrows original',async t=>{
 const f=fixture(t);let restored=false;
 await assert.rejects(withCaptureRestoration(()=>f.capture('capture'),async()=>{
  assert.deepEqual(fs.readFileSync(path.join(f.out,'capture-failure-1.png')),png);
  assert.deepEqual(fs.readFileSync(path.join(f.out,'capture-failure-1.rgba')),raw);
  const metadata=JSON.parse(fs.readFileSync(path.join(f.out,'capture-failure-1.json')));assert.equal(metadata.error,'original mismatch');assert.deepEqual(metadata.channelMax,[1,2,3,4]);
  f.clear();restored=true;
 }),/original mismatch/);assert.equal(restored,true);assert.deepEqual(f.errors,[]);
});
test('caller retains primary and restoration exceptions with both snapshots',async t=>{
 const f=fixture(t);await assert.rejects(withCaptureRestoration(()=>f.capture('capture'),()=>f.capture('capture')),error=>{
  assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);assert.match(error.message,/Capture failed:/);assert.match(error.message,/Restoration also failed:/);return true;
 });
 for(const n of [1,2])assert.deepEqual(fs.readFileSync(path.join(f.out,`capture-failure-${n}.rgba`)),raw);
});
test('write failure attempts remaining files, records blocker, preserves capture failure and failed verdict',async t=>{
 const attempts=[];const f=fixture(t,(file,bytes)=>{attempts.push(path.extname(file));if(file.endsWith('.png'))throw Error('disk full');fs.writeFileSync(file,bytes);});
 const result={errors:f.errors,failures:[]};
 await collectVisibilityEvidence({renderStage:()=>withCaptureRestoration(()=>f.capture('capture'),async()=>{}),probeProjectiles:async()=>{},save:async()=>{},onFailure:failure=>result.failures.push(failure)});
 assert.equal(result.failures.length,4);assert.equal(visibilityVerdict(result),'failed');assert.match(result.failures[0].error,/original mismatch/);assert.match(result.errors[0],/disk full/);assert.deepEqual(attempts.slice(0,3),['.png','.rgba','.json']);assert.deepEqual(fs.readFileSync(path.join(f.out,'capture-failure-1.rgba')),raw);
});
test('restore-only failure propagates, successful measure and restore return result',async()=>{
 const error=Error('restore failed');await assert.rejects(withCaptureRestoration(async()=>42,async()=>{throw error;}),e=>e===error);
 assert.equal(await withCaptureRestoration(async()=>42,async()=>{}),42);
});
test('orchestration reports both measurement and restore failures and never passes',async()=>{
 const result={errors:[],failures:[]};await collectVisibilityEvidence({renderStage:()=>withCaptureRestoration(async()=>{throw Error('primary marker');},async()=>{throw Error('restore marker');}),probeProjectiles:async()=>{},save:async()=>{},onFailure:failure=>result.failures.push(failure)});
 assert.equal(visibilityVerdict(result),'failed');assert.equal(result.failures.length,4);for(const f of result.failures){assert.match(f.error,/primary marker/);assert.match(f.error,/restore marker/);}
});

test('restoration failure before capture cannot reattribute a consumed primary snapshot',async t=>{
 const f=fixture(t);await assert.rejects(withCaptureRestoration(()=>f.capture('capture'),()=>f.capture('restore-before-capture')),error=>{
  assert.ok(error instanceof AggregateError);assert.match(error.message,/original mismatch/);assert.match(error.message,/early restore error/);return true;
 });
 assert.deepEqual(fs.readdirSync(f.out).sort(),['capture-failure-1.json','capture-failure-1.png','capture-failure-1.rgba']);
});

test('failed baseline preserves failure while later modes and paired composer still run',async()=>{
 const visited=[],failures=[];const run=()=>collectCaptureModes({modes:['baseline','no-ink','fill-035'],onFailure:async failure=>failures.push(failure),runMode:mode=>withCaptureRestoration(async()=>{visited.push(mode);if(mode==='baseline')throw Error('baseline invalid');},async()=>{visited.push(mode+'-composer');})});
 await assert.rejects(run(),/baseline invalid/);assert.deepEqual(visited,['baseline','baseline-composer','no-ink','no-ink-composer','fill-035','fill-035-composer']);assert.equal(failures.length,1);assert.equal(failures[0].mode,'baseline');assert.equal(visibilityVerdict({failures}),'failed');
});
