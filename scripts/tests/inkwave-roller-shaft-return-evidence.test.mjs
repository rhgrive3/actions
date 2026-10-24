// Browser evidence regression. Live runtime coverage is in roller-shaft-production.
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{gunzipSync}from'node:zlib';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'reports/roller-shaft-return-20261023'),read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p)),
 before=read(path.join(folder,'raw/before-released-edge-60.json.gz')),candidate=read(path.join(folder,'raw/candidate-released-edge-60.json.gz')),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),step=(p,t)=>distance(p.frames[t].centre,p.frames[t-1].centre);

test('old browser49 fails the original authored-tail bound; candidate passes without moving40/start/end',()=>{
 const tail=Math.max(...Array.from({length:7},(_,i)=>step(before,50+i)));
 assert(step(before,49)>tail,'negative control exposes the added floor-solution spike');assert(step(candidate,49)<=tail,'candidate avoids that spike');
 const clean=({render,...row})=>row;for(let i=0;i<66;i++)if(i<=48||i>=56)assert.deepEqual(clean(candidate.frames[i]),clean(before.frames[i]),'unchanged boundary '+i);
});

test('published raw replays exact source formula, real world trajectory and all refresh/observer checks',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shaft-evidence-'));try{const out=path.join(tmp,'analysis.json');execFileSync(process.execPath,['scripts/analyze-inkwave-roller-shaft-return.mjs',folder,out,'--published'],{cwd:root,stdio:'pipe'});assert.equal(fs.readFileSync(out,'utf8'),fs.readFileSync(path.join(folder,'analysis.json'),'utf8'));const data=read(out);assert.equal(data.fallbacks,0);assert.equal(data.refresh.length,3);assert(data.primaryPhysical.minActualDrumVertex>0);assert(data.denseIntermediateConstraints.minFloor>0);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
