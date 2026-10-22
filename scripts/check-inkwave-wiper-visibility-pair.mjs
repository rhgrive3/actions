#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {verifyRuntimeBuild,hash} from './lib/inkwave-runtime-evidence.mjs';
import {assertWiperCurrentBinding,WIPER_SOURCE,WIPER_BASELINE} from './lib/inkwave-wiper-current-binding.mjs';
import {assertWiperCoverageImage} from './lib/inkwave-wiper-flight-coverage.mjs';
export function verifyVisibilityPair(a,b,manifest,binding,readImage){
 assertWiperCurrentBinding(manifest,binding);
 for(const [variant,r]of [['A',a],['B',b]]){assert.equal(r.status,'visibility-diagnostic-only');assert.equal(r.variant,variant);assert.equal(r.head,WIPER_SOURCE);assert.equal(r.baseline,WIPER_BASELINE);assert.equal(r.id,'s3-saber-heavy');assert.equal(r.action,'charged');assert.equal(r.contentHash,manifest.contentHash);assert.equal(r.inputHash,manifest.inputHash);assert.deepEqual(r.binding,binding);assert.deepEqual(r.errors,[]);assert.deepEqual(r.responseErrors,[]);assert.equal(r.result.visibilityProbe,true);assert.equal(r.result.dt,1/60);assert.equal(r.result.frameCount,r.result.frames.length);assert.ok(r.result.frames.length>1&&r.result.frames.length<=161);assert.equal(r.result.setup.initial.ambientState.schema,1);
  for(const m of binding.modules){const key='_versions/'+binding.revision+'/'+m.rel,expected=variant==='A'?m.baselineEmittedSha256:m.candidateEmittedSha256;assert.equal(new Map(r.loaded).get(key),expected);assert.equal(new Map(r.consumed).get(key),expected);}
 }
 const A=a.result,B=b.result;for(const k of ['initial','target','palette'])assert.deepEqual(A.setup[k],B.setup[k]);assert.equal(A.frames.length,B.frames.length);
 for(let i=0;i<A.frames.length;i++){
  const x=A.frames[i],y=B.frames[i];assert.equal(x.tick,i);assert.equal(y.tick,i);
  for(const row of [x,y])assert.equal(row.state.ambientState.schema,1);
  for(const k of ['state','paintHash','paintEvents','aimTrace','memory','census'])assert.deepEqual(x[k],y[k],k);
  for(const k of ['calls','triangles','points','lines'])assert.equal(x.nativeRender[k],y.nativeRender[k],k);assert.deepEqual(x.axes.counts,y.axes.counts);
  if(i<A.frames.length-1){assert.equal(x.axes.main,null);assert.equal(y.axes.main,null);assert.deepEqual(x.images,[]);assert.deepEqual(y.images,[]);continue;}
  for(const axis of [x.axes.main,y.axes.main,x.axes.trailing,y.axes.trailing]){assert.equal(axis.length,3);assert.ok(axis.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-5);}
  assert.ok(Math.abs(x.axes.main[1])>.98);assert.ok(Math.abs(y.axes.main[1])<.02);assert.ok(Math.abs(y.axes.trailing[1])<.18);
  for(const [variant,row]of [['A',x],['B',y]]){assert.deepEqual(row.images.map(im=>im.view),['front','top']);for(const im of row.images){assertWiperCoverageImage(im,row.axes.counts);const expected='charged-'+im.view+'-'+String(i).padStart(4,'0')+'.png';assert.equal(im.file,expected);const bytes=readImage(variant,expected);assert.ok(bytes.length>1000);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.subarray(12,16).toString(),'IHDR');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),720);assert.equal(hash(bytes),im.pngSha256);}}
  for(let j=0;j<2;j++)assert.deepEqual(x.images[j].camera,y.images[j].camera);assert.ok(x.images.some((im,j)=>im.pixelHash!==y.images[j].pixelHash),'Current Dental change must be visible');
 }
 return {status:'visibility-prefix-gates-passed',source:WIPER_SOURCE,frames:A.frames.length,scope:'First live full-frame views only; retirement, tail, unchanged controls, visual review and performance remain unaccepted'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [site,source,overlay,root]=process.argv.slice(2);assert.equal(process.argv.slice(2).length,4);const manifest=verifyRuntimeBuild(path.resolve(site),path.resolve(source),WIPER_SOURCE),binding=JSON.parse(fs.readFileSync(path.join(overlay,'receipt.json')));
 const get=v=>JSON.parse(fs.readFileSync(path.join(root,v,'receipt.json')));const result=verifyVisibilityPair(get('A'),get('B'),manifest,binding,(v,name)=>fs.readFileSync(path.join(root,v,name)));fs.writeFileSync(path.join(root,'visibility-result.json'),JSON.stringify(result,null,2));console.log(result);
}
