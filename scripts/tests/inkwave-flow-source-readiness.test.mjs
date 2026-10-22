import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {awaitFlowSourceReady, validateFlowRenderResult} from '../check-inkwave-flow-render.mjs';
const ready = () => ({status:'ready',enabled:true,error:null,disposed:false});
test('Flow readiness waits for the actual replacing owner without mutating clocks or visibility',async()=>{
 let release;const ch={time:17,visible:false,sourceMotion:{status:'loading',ready:new Promise(r=>release=r)}};
 let finished=false;const pending=awaitFlowSourceReady(ch,'test',1000).then(x=>{finished=true;return x;});
 await Promise.resolve();assert.equal(finished,false);const owner=ch.sourceMotion=ready();release();assert.equal(await pending,owner);assert.equal(ch.time,17);assert.equal(ch.visible,false);
});
test('loading, disabled, disposed, failed, rejected and never-settling owners fail closed',async()=>{
 for(const values of [{status:'loading'},{status:'unavailable'},{enabled:false},{disposed:true},{error:Error('failed')}]){
  const sourceMotion={...ready(),...values,ready:Promise.resolve()};await assert.rejects(awaitFlowSourceReady({sourceMotion},'negative',100),/owner unavailable/);
 }
 await assert.rejects(awaitFlowSourceReady({sourceMotion:{ready:Promise.reject(Error('bad bank'))}},'negative',100),/bad bank/);
 await assert.rejects(awaitFlowSourceReady({sourceMotion:{ready:new Promise(()=>{})}},'negative',5),/timed out/);
 await assert.rejects(awaitFlowSourceReady({},'negative',100),/Missing/);
 for(const timeout of [0,-1,NaN,Infinity])await assert.rejects(awaitFlowSourceReady({},'negative',timeout),/Invalid/);
});
const source=fs.readFileSync(new URL('../check-inkwave-flow-render.mjs',import.meta.url),'utf8');
test('render acceptance keeps complete upload/lifetime gates and uses public dry-state rendering',()=>{
 assert.ok(source.includes("assert([...borrowedArrays].every(a => uploads.has(a) && gl.isBuffer(uploads.get(a)))"));
 assert.ok(source.includes('result.disposal.nativeAttributes !== result.disposal.uploadedNativeAttributes'));
 assert.ok(source.includes("paint.clear(); actor.intent.squid = true;"));
 assert.ok(source.includes("actor.anim.form === 'squid' && ch.form === 'squid' && drawable(ch.squid.body)"));
 assert.ok(source.includes('const drySquidPixels = pair(\'beauty\').changedPixels'));
 assert.ok(source.includes('source.skeleton.update(); source.getVertexPosition(i, native); mesh.getVertexPosition(i, edge);'));
 assert.ok(source.indexOf("awaitFlowSourceReady(ch, 'owner')") < source.indexOf('const sources = new Map()'));
 assert.ok(source.indexOf("awaitFlowSourceReady(survivor, 'survivor')") < source.indexOf('const survivorBefore'));
 assert.ok(!/gl\.(createBuffer|bindBuffer)\(/.test(source),'only native renderer creates/uploads buffers');
});
const result=()=>{
 const difference={pixels:480*360,changedPixels:20,changedBytes:20,totalDifference:20};
 const zero={...difference,changedPixels:0,changedBytes:0,totalDifference:0};
 return {rows:['kid-entry','kid-active','extension','squid-entry','squid-active','kid-return','expiry','off','reset','death','hidden'].map((name,i)=>({name,pixels:{beauty:difference,normal:zero,depth:zero,ao:zero},overrideMeshes:1,flowGpuBeautyDraws:1,flowBeautyCalls:i<7?1:0,visibleMeshes:i<7?1:0,sourceGeometryChanged:false,overrideNonzero:0,beautyZero:0,flowGpuOverrideDraws:0,nativeIK:[0]})),nativePixels:{normal:difference,depth:difference,ao:difference},componentPixels:{shell:difference,glint:difference,ribbon:difference},unsafeOverridePixels:{normal:difference,depth:difference,ao:difference},disposal:{ownerSourceStatus:'ready',survivorSourceStatus:'ready',drySquidDraws:1,drySquidPixels:20,drySquidShellPixels:20,drySquidOverrideDraws:0,drySquidOverridePixels:{normal:zero,depth:zero,ao:zero},uploadedNativeBuffers:38,disposedViews:4,deletedOwnedBuffers:2,releasedViewVAOs:4,survivorPixels:20,deletedNativeBuffers:0,nativeBuffersAlive:38,survivorNormalChangedBytes:0,detachedViews:4,nativeAttributes:38,uploadedNativeAttributes:38},lifecycle:{activationCount:1,extensionCount:1,expiryCount:1,expiryTicks:1,resetImmediate:true,deathImmediate:true,zeroDtFrozen:true,disposed:true}};
};
test('missing native dry-state/readiness proof and existing pixel/buffer corruptions still reject',()=>{
 validateFlowRenderResult(result());
 for(const edit of [r=>r.disposal.ownerSourceStatus='loading',r=>r.disposal.survivorSourceStatus='loading',r=>r.disposal.drySquidDraws=0,r=>r.disposal.drySquidPixels=0,r=>r.disposal.drySquidShellPixels=0,r=>r.disposal.drySquidOverrideDraws++,r=>r.disposal.drySquidOverridePixels.normal={...r.disposal.drySquidOverridePixels.normal,changedBytes:1},r=>r.disposal.uploadedNativeAttributes--,r=>r.disposal.deletedNativeBuffers++,r=>r.disposal.nativeBuffersAlive--,r=>r.disposal.survivorNormalChangedBytes++,r=>r.rows[0].pixels.normal={...r.rows[0].pixels.normal,changedBytes:1},r=>r.rows[0].flowGpuOverrideDraws++]){const r=result();edit(r);assert.throws(()=>validateFlowRenderResult(r));}
});
